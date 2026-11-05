import test from 'node:test';
import assert from 'node:assert/strict';
import {sortAssets} from '../public/sorting.js';
import {normalizeNft} from '../public/core.js';
import {alchemyOwnership,fillAcquisitionTimes} from '../lib/nft-providers.js';
const now=Date.now();
const asset=(id,value,date)=>({id,token_id:id,acquired_at:date,market_price:value==null?null:{kind:'LISTING',currency:'ETH',value_eth:value,quoted_at:new Date(now).toISOString()}});
test('default sorts exact ETH prices descending, keeps unknown last, and does not mutate source',()=>{
  const input=[asset('10',null),asset('3','1.000000000000000001'),asset('2','1.000000000000000002'),asset('1','0.5')];
  assert.deepEqual(sortAssets(input,undefined,now).map(a=>a.id),['2','3','1','10']);
  assert.equal(input[0].id,'10');
  const expired=asset('5','999');expired.market_price.quoted_at=new Date(now-3600001).toISOString();
  assert.deepEqual(sortAssets([expired,asset('2','0.01')],undefined,now).map(a=>a.id),['2','5']);
});
test('recent acquisition sorts across wallets; sync times cannot masquerade as acquisition',()=>{
  const items=[{...asset('1',null),last_synced_at:'2099-01-01'},asset('2',null,'2025-01-01'),asset('3',null,'2026-01-01')];
  assert.deepEqual(sortAssets(items,'RECENT').map(a=>a.id),['3','2','1']);
});
test('token IDs use numeric ascending order even beyond safe integer range',()=>{
  assert.deepEqual(sortAssets(['10000000000000000001','10','2','10000000000000000000'].map(id=>asset(id,null)),'TOKEN_ASC').map(a=>a.id),['2','10','10000000000000000000','10000000000000000001']);
});
test('collection floors and ETH listings share one comparable scale; unavailable stays last',()=>{
  const floor=asset('2','0.3');floor.market_price.kind='COLLECTION_FLOOR';
  const wrong=asset('1','99');wrong.market_price.currency='WETH';
  assert.deepEqual(sortAssets([wrong,floor,asset('3','0.2')]).map(a=>a.id),['2','3','1']);
});
test('Alchemy requests transferTime and normalizes actual acquisition timestamp only',async()=>{
  const contract='0x'+'1'.repeat(40),owner='0x'+'2'.repeat(40);const collections=[{contract,id:'TEST',type:'LAND'}];
  const nft={contract:{address:contract},tokenId:'1',acquiredAt:{blockTimestamp:'2026-01-02T03:04:05Z'}};
  const results=await alchemyOwnership(owner,collections,{alchemyKey:'key',fetcher:async url=>{assert.equal(new URL(url).searchParams.get('orderBy'),'transferTime');return Response.json({ownedNfts:[nft]});}});
  assert.equal(results[0].acquired_at,'2026-01-02T03:04:05.000Z');
  assert.equal(normalizeNft({...nft,acquiredAt:{blockTimestamp:'invalid'}},owner,collections).acquired_at,null);
});
test('transfer fallback matches owner, contract and numeric token ID and retains newest acquisition across pages',async()=>{
  const contract='0x'+'1'.repeat(40),owner='0x'+'2'.repeat(40);const input=[{id:contract+':10',contract,token_id:'10',acquired_at:null},{id:contract+':11',contract,token_id:'11',acquired_at:null}];
  let page=0;const row=(token,date,to=owner)=>({to,rawContract:{address:contract},tokenId:token,category:'erc721',metadata:{blockTimestamp:date}});
  const result=await fillAcquisitionTimes(input,owner,{alchemyKey:'key',fetcher:async(url,options)=>{const request=JSON.parse(options.body);assert.equal(request.method,'alchemy_getAssetTransfers');assert.equal(request.params[0].order,'desc');page++;return Response.json({result:page===1?{transfers:[row('0x0a','2026-01-02'),row('0x0b','2026-01-03',contract)],pageKey:'next'}:{transfers:[row('0x0a','2025-01-01'),row('0x0b','2024-01-01')]}});}});
  assert.equal(result[0].acquired_at,'2026-01-02T00:00:00.000Z');assert.equal(result[1].acquired_at,'2024-01-01T00:00:00.000Z');assert.equal(input[0].acquired_at,null);
  assert.deepEqual(await fillAcquisitionTimes(input,owner,{alchemyKey:'key',fetcher:async()=>{throw Error('offline');}}),input);
});
