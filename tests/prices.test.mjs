import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ethFromWei,listingEth,collectionFloorEth,createPriceService} from '../lib/market-prices.js';
import {pricePresentation} from '../public/prices.js';
import {createBridgeApi} from '../lib/bridge-api.js';
const registry=JSON.parse(await readFile(new URL('../public/registry.json',import.meta.url)));
const contract=registry.collections[0].contract.toLowerCase();
const asset={id:contract+':1',contract,token_id:'1'};
const listing={status:'ACTIVE',chain:'ethereum',price:{current:{currency:'ETH',decimals:18,value:'1234567890123456789'}}};
function cache(){const m=new Map();return {getMetadata:async k=>m.get(k),setMetadata:async(k,v)=>m.set(k,structuredClone(v))};}
test('ETH uses exact wei decimals; non-ETH, expired and inactive listings are rejected',()=>{
  assert.equal(ethFromWei('1234567890123456789',18),'1.234567890123456789');
  assert.equal(ethFromWei('1',18),'0.000000000000000001');
  assert.equal(ethFromWei('1',6),null);assert.equal(ethFromWei('-1',18),null);
  assert.equal(listingEth(listing),'1.234567890123456789');
  assert.equal(listingEth({...listing,status:'CANCELLED'}),null);
  assert.equal(listingEth({...listing,protocol_data:{parameters:{endTime:'1'}}}),null);
  assert.equal(listingEth({...listing,price:{current:{currency:'WETH',decimals:18,value:'1'}}}),null);
});
test('floor explicitly requires ETH symbol and positive price; missing prices never show zero',()=>{
  assert.equal(collectionFloorEth({total:{floor_price:0.05,floor_price_symbol:'ETH'}}),'0.05');
  assert.equal(collectionFloorEth({total:{floor_price:1,volume_symbol:'ETH',floor_price_symbol:'WETH'}}),null);
  assert.equal(collectionFloorEth({total:{floor_price:0,floor_price_symbol:'ETH'}}),null);
  assert.equal(pricePresentation({kind:'UNAVAILABLE',currency:'ETH',value_eth:null}).amount,'정보 없음');
  assert.equal(pricePresentation({kind:'COLLECTION_FLOOR',currency:'ETH',value_eth:'0.065301'}).label,'컬렉션 바닥가');
  assert.equal(pricePresentation({kind:'LISTING',currency:'ETH',value_eth:'1.23456789'}).amount,'1.234568 ETH');
});
test('live listing takes priority; unlisted NFTs use floor and share collection cache',async()=>{
  const calls=[];const service=createPriceService({cache:cache(),openseaKey:'secret',fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.headers['x-api-key'],'secret');assert.equal(options.redirect,'manual');
    if(url.includes('/contract/'))return Response.json({address:contract,chain:'ethereum',collection:'test-collection'});
    if(url.endsWith('/nfts/1/best'))return Response.json(listing);
    if(url.includes('/nfts/'))return Response.json({}, {status:404});
    return Response.json({total:{floor_price:0.05,floor_price_symbol:'ETH'}});
  }});
  assert.equal((await service.quote(asset)).kind,'LISTING');
  assert.equal((await service.quote({...asset,id:contract+':2',token_id:'2'})).kind,'COLLECTION_FLOOR');
  await service.quote({...asset,id:contract+':3',token_id:'3'});await service.quote(asset);
  assert.equal(calls.filter(u=>u.includes('/contract/')).length,1);
  assert.equal(calls.filter(u=>u.endsWith('/stats')).length,1);
  assert.equal(calls.filter(u=>u.endsWith('/nfts/1/best')).length,1);
});
test('provider outage retains a recent quote with stale marker, then expires it',async()=>{
  let now=Date.now(),fail=false;const service=createPriceService({cache:cache(),openseaKey:'key',now:()=>now,fetcher:async url=>{
    if(fail)return Response.json({}, {status:429});
    return Response.json(url.includes('/contract/')?{address:contract,chain:'ethereum',collection:'test'}:listing);
  }});
  await service.quote(asset);fail=true;now+=6*60000;
  const old=await service.quote(asset);assert.equal(old.stale,true);assert.equal(old.kind,'LISTING');
  now+=60*60000;assert.equal((await service.quote(asset)).kind,'UNAVAILABLE');
});
test('price endpoint validates collection and uint256 token IDs and deduplicates normalized IDs',async()=>{
  const handle=createBridgeApi({registry,cache:cache(),fetcher:async()=>{throw Error('unexpected fetch');}});
  const post=assets=>handle(new Request('http://local/api/v1/assets/prices',{method:'POST',body:JSON.stringify({assets})}));
  assert.equal((await post([])).status,400);
  assert.equal((await post([{contract:'0x'+'1'.repeat(40),token_id:'1'}])).status,400);
  assert.equal((await post([{contract,token_id:(2n**256n).toString()}])).status,400);
  const result=await (await post([asset,{contract,token_id:'01'}])).json();
  assert.equal(result.prices.length,1);assert.equal(result.prices[0].market_price.reason,'NOT_CONFIGURED');
});
