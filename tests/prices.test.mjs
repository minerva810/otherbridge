import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ethFromWei,listingEth,createPriceService} from '../lib/market-prices.js';
import {pricePresentation,formatEth,isCurrentBuyNow} from '../public/prices.js';
import {createBridgeApi} from '../lib/bridge-api.js';
const registry=JSON.parse(await readFile(new URL('../public/registry.json',import.meta.url)));
const contract=registry.collections[0].contract.toLowerCase();const asset={id:contract+':1',contract,token_id:'1'};
const listing={status:'ACTIVE',chain:'ethereum',price:{current:{currency:'ETH',decimals:18,value:'1234567890123456789'}}};
function cache(){const m=new Map();return {getMetadata:async k=>m.get(k),setMetadata:async(k,v)=>m.set(k,structuredClone(v))};}
const quote=(overrides={})=>({quote_schema:2,kind:'LISTING',currency:'ETH',value_eth:'1.234567890123456789',quoted_at:new Date().toISOString(),...overrides});
test('exact wei conversion and ETH display preserve every digit without exchange rates or rounding',()=>{
  assert.equal(ethFromWei('1234567890123456789',18),'1.234567890123456789');
  assert.equal(ethFromWei('1',18),'0.000000000000000001');assert.equal(ethFromWei('1',6),null);
  assert.equal(formatEth('1.234567890123456789'),'1.234567890123456789');assert.equal(formatEth('1234.000000000000000001'),'1,234.000000000000000001');
  assert.equal(pricePresentation(quote()).amount,'1.234567890123456789 ETH');assert.equal(pricePresentation(quote()).label,'Buy now');
});
test('only active Ethereum ETH listings are valid; future, expired and other-currency listings are rejected',()=>{
  assert.equal(listingEth(listing),'1.234567890123456789');
  for(const extra of [{status:'CANCELLED'},{chain:'base'},{status:undefined},{protocol_data:{parameters:{endTime:'1'}}},{protocol_data:{parameters:{startTime:'9999999999'}}},{protocol_data:{parameters:{endTime:'bad'}}},{price:{current:{currency:'WETH',decimals:18,value:'1'}}}])assert.equal(listingEth({...listing,...extra}),null);
});
test('presentation distinguishes not listed, non-ETH and API failures; old floors never become Buy now prices',()=>{
  assert.equal(pricePresentation(quote({kind:'NOT_LISTED',value_eth:null})).amount,'판매 등록 없음');
  assert.equal(pricePresentation(quote({kind:'NON_ETH_LISTING',value_eth:null})).amount,'ETH 판매가 없음');
  assert.equal(pricePresentation(quote({kind:'UNAVAILABLE',value_eth:null})).amount,'가격 확인 불가');
  assert.equal(pricePresentation({kind:'COLLECTION_FLOOR',currency:'ETH',value_eth:'1'}).available,false);
  assert.equal(isCurrentBuyNow(quote({expires_at:'2020-01-01'})),false);
  assert.equal(isCurrentBuyNow(quote({quoted_at:new Date(Date.now()-61000).toISOString()})),false);
});
test('unlisted assets never fetch collection floors, reuse collection identity and isolate old caches',async()=>{
  const calls=[];const c=cache();await c.setMetadata('market:asset:'+asset.id,{kind:'COLLECTION_FLOOR',value_eth:'999',quoted_at:new Date().toISOString()});
  const service=createPriceService({cache:c,openseaKey:'secret',fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.headers['x-api-key'],'secret');assert.equal(options.redirect,'manual');const u=new URL(url);
    if(u.pathname.includes('/contract/'))return Response.json({address:contract,chain:'ethereum',collection:'test-collection'});
    assert.equal(u.searchParams.get('include_private_listings'),'false');
    return u.pathname.endsWith('/nfts/1/best')?Response.json(listing):Response.json({}, {status:404});
  }});
  assert.equal((await service.quote(asset)).value_eth,'1.234567890123456789');
  assert.equal((await service.quote({...asset,id:contract+':2',token_id:'2'})).kind,'NOT_LISTED');
  await service.quote(asset);assert.equal(calls.length,3);assert.ok(calls.every(u=>!u.includes('/stats')));
});
test('an outage after a successful quote hides the old price instead of claiming a current Buy now value',async()=>{
  let now=Date.now(),fail=false;const service=createPriceService({cache:cache(),openseaKey:'key',now:()=>now,fetcher:async url=>{
    if(fail)return Response.json({}, {status:429});return Response.json(url.includes('/contract/')?{address:contract,chain:'ethereum',collection:'test'}:listing);
  }});
  assert.equal((await service.quote(asset)).kind,'LISTING');fail=true;now+=61000;
  const result=await service.quote(asset);assert.equal(result.kind,'UNAVAILABLE');assert.equal(result.value_eth,null);assert.equal(result.reason,'PROVIDER_UNAVAILABLE');
});
test('listing expiry invalidates cache before one minute; non-ETH listings are not converted',async()=>{
  let now=Date.now(),listed=true;const active={...listing,protocol_data:{parameters:{endTime:String(Math.floor(now/1000)+5)}}};
  const service=createPriceService({cache:cache(),openseaKey:'key',now:()=>now,fetcher:async url=>Response.json(url.includes('/contract/')?{address:contract,chain:'ethereum',collection:'test'}:listed?active:{...listing,price:{current:{currency:'USDC',decimals:6,value:'1000000'}}})});
  assert.equal((await service.quote(asset)).kind,'LISTING');now+=6000;listed=false;
  const result=await service.quote(asset);assert.equal(result.kind,'NON_ETH_LISTING');assert.equal(result.value_eth,null);
});
test('price API validates supported collection and uint256 IDs and deduplicates normalized assets',async()=>{
  const handle=createBridgeApi({registry,cache:cache(),fetcher:async()=>{throw Error('unexpected fetch');}});
  const post=assets=>handle(new Request('http://local/api/v1/assets/prices',{method:'POST',body:JSON.stringify({assets})}));
  assert.equal((await post([])).status,400);assert.equal((await post([{contract:'0x'+'1'.repeat(40),token_id:'1'}])).status,400);
  assert.equal((await post([{contract,token_id:(2n**256n).toString()}])).status,400);
  const data=await(await post([asset,{contract,token_id:'01'}])).json();assert.equal(data.prices.length,1);assert.equal(data.prices[0].market_price.reason,'NOT_CONFIGURED');
});
