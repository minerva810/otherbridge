import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {alchemyOwnership,openseaOwnership,openseaMetadata,mergeMetadata,createNftService} from '../lib/nft-providers.js';
import {createBridgeApi} from '../lib/bridge-api.js';
const registry=JSON.parse(await readFile(new URL('../public/registry.json',import.meta.url)));
const contract=registry.collections[0].contract;const owner='0x1234567890abcdef1234567890abcdef12345678';
const nft=(tokenId='1',image='https://example.com/nft.png')=>({contract:{address:contract},tokenId,image:{cachedUrl:image},raw:{metadata:{attributes:[{trait_type:'Fur',value:'Gold'}]}}});
function memoryCache(){const wallets=new Map(),metadata=new Map();return {getWallet:async id=>wallets.get(id),setWallet:async(id,data)=>wallets.set(id,structuredClone(data)),getMetadata:async id=>metadata.get(id),setMetadata:async(id,data)=>metadata.set(id,structuredClone(data))};}
const response=(data,status=200)=>Response.json(data,{status});
test('Alchemy follows every page, filters supported contracts, deduplicates, and sends key only server-side',async()=>{
  const requests=[];
  const fetcher=async(url,options)=>{assert.equal(options.redirect,'manual','Edge runtime requires manual redirect handling');requests.push(new URL(url));return response(requests.length===1?{ownedNfts:[nft(),{contract:{address:owner},tokenId:'90'}],pageKey:'next-page'}:{ownedNfts:[nft(),nft('2')]});};
  const assets=await alchemyOwnership(owner,registry.collections,{alchemyKey:'server-key',fetcher});assert.equal(assets.length,2);assert.equal(requests[1].searchParams.get('pageKey'),'next-page');assert.equal(requests[0].searchParams.getAll('contractAddresses[]').length,5);assert.equal(assets[0].ownership_source,'alchemy');assert.ok(!JSON.stringify(assets).includes('server-key'));
});
test('OpenSea account fallback follows next cursors and filters unsupported contracts',async()=>{
  let calls=0;const fetcher=async(url,options)=>{assert.equal(options.headers['x-api-key'],'private-key');const u=new URL(url);assert.ok(u.pathname.endsWith(`/account/${owner}/nfts`));calls++;if(calls===2)assert.equal(u.searchParams.get('next'),'cursor');return response({nfts:[{contract,identifier:String(calls),image_url:'https://example.com/n.png'},{contract:owner,identifier:'9'}],...(calls===1?{next:'cursor'}:{})});};
  const assets=await openseaOwnership(owner,registry.collections,{openseaKey:'private-key',fetcher});assert.equal(assets.length,2);assert.equal(assets[0].ownership_source,'opensea');
});
test('OpenSea metadata uses exact contract/token and cannot override ownership',async()=>{
  const metadata=await openseaMetadata(contract,'1',{openseaKey:'secret',fetcher:async(url,options)=>{assert.equal(options.headers['x-api-key'],'secret');assert.ok(String(url).endsWith('/nfts/1'));return response({nft:{identifier:'1',contract,image_url:'ipfs://image-hash',traits:[{trait_type:'Eyes',value:'Blue'}],owners:[{address:'attacker'}]}});}});
  const asset={id:contract+':1',contract,token_id:'1',owner_wallet:owner,ownership_source:'alchemy',image:'',traits:[],metadata_sources:['alchemy']};
  const merged=mergeMetadata(asset,metadata);assert.equal(merged.owner_wallet,owner);assert.equal(merged.ownership_source,'alchemy');assert.equal(merged.image,'https://ipfs.io/ipfs/image-hash');assert.deepEqual(merged.metadata_sources,['alchemy','opensea']);
  await assert.rejects(()=>openseaMetadata(contract,'1',{openseaKey:'secret',fetcher:async()=>response({nft:{identifier:'2'}})}),/응답 형식/);
});
test('OpenSea fills missing metadata while a metadata outage preserves ownership',async()=>{
  const cache=memoryCache();const fetcher=async url=>String(url).includes('alchemy.com')?response({ownedNfts:[{...nft(),image:{},raw:{metadata:{}}}]}):response({nft:{identifier:'1',contract,image_url:'https://example.com/recovered.png',traits:[{trait_type:'Hat',value:'Cap'}]}});
  const service=createNftService({collections:registry.collections,cache,alchemyKey:'key',openseaKey:'key',fetcher});const result=await service.wallet(owner);assert.equal(result.assets[0].image,'https://example.com/recovered.png');assert.equal(result.assets[0].traits[0].value,'Cap');
  const failed=createNftService({collections:registry.collections,cache:memoryCache(),alchemyKey:'key',openseaKey:'key',fetcher:async url=>String(url).includes('alchemy.com')?response({ownedNfts:[{...nft(),image:{}}]}):response({},429)});const degraded=await failed.wallet(owner);assert.equal(degraded.assets.length,1);assert.ok(degraded.assets[0].metadata_warning.includes('OpenSea'));
});
test('fresh cache avoids upstream requests, force refresh bypasses cache, stale fallback retains original sync time',async()=>{
  const cache=memoryCache();let now=Date.now();let calls=0;let fail=false;
  const service=createNftService({collections:registry.collections,cache,alchemyKey:'key',now:()=>now,fetcher:async()=>{calls++;return fail?response({},503):response({ownedNfts:[{...nft(),acquiredAt:{blockTimestamp:'2025-01-01T00:00:00Z'}}]});}});
  const first=await service.wallet(owner);await service.wallet(owner);assert.equal(calls,1);await service.wallet(owner,{force:true});assert.equal(calls,2);fail=true;now+=11*60*1000;
  const stale=await service.wallet(owner);assert.equal(stale.stale,true);assert.equal(stale.last_synced_at,first.last_synced_at);
  now+=25*60*60*1000;await assert.rejects(()=>service.wallet(owner),/Alchemy/);
});
test('Alchemy failure falls back to OpenSea without mixing partial pages',async()=>{
  const service=createNftService({collections:registry.collections,cache:memoryCache(),alchemyKey:'key',openseaKey:'key',fetcher:async url=>String(url).includes('alchemy.com')?response({},429):response({nfts:[{contract,identifier:'9',image_url:'https://example.com/9.png',traits:[{trait_type:'Hat',value:'Cap'}]}]})});
  const result=await service.wallet(owner);assert.equal(result.assets.length,1);assert.equal(result.assets[0].token_id,'9');assert.equal(result.assets[0].ownership_source,'opensea');assert.ok(result.warning.includes('Alchemy'));
});
test('empty successful response replaces old holdings instead of returning sample assets',async()=>{
  const cache=memoryCache();await cache.setWallet(owner,{assets:[nft()],last_synced_at:'2000-01-01'});const service=createNftService({collections:registry.collections,cache,alchemyKey:'key',fetcher:async()=>response({ownedNfts:[]})});const result=await service.portfolio([owner]);assert.equal(result.asset_count,0);assert.deepEqual(result.assets,[]);
});
test('API validates wallet input, returns provider status, and never leaks credentials',async()=>{
  const api=createBridgeApi({registry,cache:memoryCache(),alchemyKey:'alchemy-secret',openseaKey:'opensea-secret',fetcher:async()=>response({ownedNfts:[nft()]})});
  const health=await api(new Request('https://site/api/v1/health'));const healthData=await health.json();assert.equal(healthData.opensea_configured,true);assert.equal(healthData.providers.ownership,'alchemy');assert.ok(!JSON.stringify(healthData).includes('secret'));
  const bad=await api(new Request('https://site/api/v1/portfolio/resolve',{method:'POST',body:JSON.stringify({wallets:['bad']})}));assert.equal(bad.status,400);
  const valid=await api(new Request('https://site/api/v1/portfolio/resolve',{method:'POST',body:JSON.stringify({wallets:[owner,owner]})}));const portfolio=await valid.json();assert.equal(portfolio.wallet_count,1);assert.equal(portfolio.asset_count,1);assert.ok(!JSON.stringify(portfolio).includes('secret'));
  const detail=await api(new Request(`https://site/api/v1/assets/${contract}:1?owner=${owner}`));assert.equal(detail.status,200);
});
test('upstream failures have actionable redacted errors and repeated cursors never cache partial results',async()=>{
  await assert.rejects(()=>alchemyOwnership(owner,registry.collections,{alchemyKey:'sensitive-key',fetcher:async()=>{throw new Error('https://alchemy.com/sensitive-key');}}),error=>!error.message.includes('sensitive-key'));
  await assert.rejects(()=>alchemyOwnership(owner,registry.collections,{alchemyKey:'key',fetcher:async()=>response({ownedNfts:[nft()],pageKey:'repeat'})}),/응답 형식/);
});
