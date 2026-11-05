import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ethFromWei,listingEth,portfolioValue,createPriceService} from '../lib/market-prices.js';
import {pricePresentation,formatEth,isCurrentPrice,sumAssetValues} from '../public/prices.js';
import {createBridgeApi} from '../lib/bridge-api.js';
const registry=JSON.parse(await readFile(new URL('../public/registry.json',import.meta.url)));
const contract=registry.collections[0].contract.toLowerCase();const asset={id:contract+':1',contract,token_id:'1'};
const listing={status:'ACTIVE',chain:'ethereum',price:{current:{currency:'ETH',decimals:18,value:'1234567890123456789'}}};
function cache(){const m=new Map();return {getMetadata:async k=>m.get(k),setMetadata:async(k,v)=>m.set(k,structuredClone(v))};}
const quote=(overrides={})=>({quote_schema:3,kind:'LISTING',currency:'ETH',value_eth:'1.234567890123456789',quoted_at:new Date().toISOString(),...overrides});
test('total asset value sums listing and Portfolio prices exactly in wei and deduplicates NFTs',()=>{
  const assets=[{id:'a',market_price:quote({value_eth:'0.1'})},{id:'b',market_price:quote({kind:'PORTFOLIO_VALUE',value_eth:'0.200000000000000001'})},{id:'a',market_price:quote({value_eth:'0.1'})}];
  const total=sumAssetValues(assets);assert.equal(total.value_eth,'0.300000000000000001');assert.equal(total.priced_count,2);assert.equal(total.estimated_count,1);assert.equal(total.unpriced_count,0);
  assert.equal(assets.length,3);
});
test('total value excludes missing, expired, wrong-currency and demo prices, and distinguishes no assets from unknown value',()=>{
  const unknown=[{id:'a'},{id:'b',market_price:quote({expires_at:'2020-01-01'})},{id:'c',market_price:quote({currency:'WETH'})},{id:'d',demo:true,market_price:quote()}];
  assert.equal(sumAssetValues([]).value_eth,'0');assert.equal(sumAssetValues(unknown).value_eth,null);
  const partial=sumAssetValues([...unknown,{id:'e',market_price:quote({value_eth:'5.27'})}]);
  assert.equal(partial.value_eth,'5.27');assert.equal(partial.unpriced_count,4);assert.equal(partial.total_count,5);
});
test('exact wei conversion and ETH display preserve every digit without exchange rates or rounding',()=>{
  assert.equal(ethFromWei('1234567890123456789',18),'1.234567890123456789');
  assert.equal(ethFromWei('1',18),'0.000000000000000001');assert.equal(ethFromWei('1',6),null);
  assert.equal(formatEth('1.234567890123456789'),'1.234567890123456789');assert.equal(formatEth('1234.000000000000000001'),'1,234.000000000000000001');
  assert.equal(pricePresentation(quote()).amount,'1.234567890123456789 ETH');assert.equal(pricePresentation(quote()).label,undefined);
});
test('only active Ethereum ETH listings are valid; future, expired and other-currency listings are rejected',()=>{
  assert.equal(listingEth(listing),'1.234567890123456789');
  for(const extra of [{status:'CANCELLED'},{chain:'base'},{status:undefined},{protocol_data:{parameters:{endTime:'1'}}},{protocol_data:{parameters:{startTime:'9999999999'}}},{protocol_data:{parameters:{endTime:'bad'}}},{price:{current:{currency:'WETH',decimals:18,value:'1'}}}])assert.equal(listingEth({...listing,...extra}),null);
});
test('presentation distinguishes not listed, non-ETH and API failures; old floors never become Buy now prices',()=>{
  assert.equal(pricePresentation(quote({kind:'NO_PORTFOLIO_VALUE',value_eth:null})).amount,'평가 정보 없음');
  assert.equal(pricePresentation(quote({kind:'PORTFOLIO_VALUE',value_eth:'5.27'})).amount,'5.27 ETH');
  assert.equal(pricePresentation(quote({kind:'NON_ETH_LISTING',value_eth:null})).amount,'ETH 판매가 없음');
  assert.equal(pricePresentation(quote({kind:'UNAVAILABLE',value_eth:null})).amount,'가격 확인 불가');
  assert.equal(pricePresentation({kind:'COLLECTION_FLOOR',currency:'ETH',value_eth:'1'}).available,false);
  assert.equal(isCurrentPrice(quote({expires_at:'2020-01-01'})),false);
  assert.equal(isCurrentPrice(quote({quoted_at:new Date(Date.now()-61000).toISOString()})),false);
});
test('unlisted assets never fetch collection floors, reuse collection identity and isolate old caches',async()=>{
  const calls=[];const c=cache();await c.setMetadata('market:asset:'+asset.id,{kind:'COLLECTION_FLOOR',value_eth:'999',quoted_at:new Date().toISOString()});
  const service=createPriceService({cache:c,openseaKey:'secret',fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.headers['x-api-key'],'secret');assert.equal(options.redirect,'manual');const u=new URL(url);
    if(u.pathname.includes('/contract/'))return Response.json({address:contract,chain:'ethereum',collection:'test-collection'});
    if(u.pathname.endsWith('/offer_aggregates'))return Response.json({offer_aggregates:[{total_offers:4,offer_price:{token_unit:0.0602,symbol:'WETH',chain:'ethereum'},total_value:{token_unit:0.2408}}]});
    assert.equal(u.searchParams.get('include_private_listings'),'false');
    return u.pathname.endsWith('/nfts/1/best')?Response.json(listing):Response.json({}, {status:404});
  }});
  assert.equal((await service.quote(asset)).value_eth,'1.234567890123456789');
  const estimated=await service.quote({...asset,id:contract+':2',token_id:'2'});assert.equal(estimated.kind,'PORTFOLIO_VALUE');assert.equal(estimated.value_eth,'0.0602');assert.equal(estimated.original_currency,'WETH');assert.equal(estimated.estimated,true);
  await service.quote({...asset,id:contract+':3',token_id:'3'});
  await service.quote(asset);assert.equal(calls.length,5);assert.equal(calls.filter(u=>u.includes('/offer_aggregates')).length,1);assert.ok(calls.every(u=>!u.includes('/stats')));
});
test('Portfolio valuation uses highest collection offer per NFT, never total volume or a lower currency bucket',()=>{
  const top={total_offers:8,offer_price:{token_unit:5.27,symbol:'WETH',chain:'ethereum'},total_value:{token_unit:42.16}};
  assert.equal(portfolioValue({offer_aggregates:[top]}).value_eth,'5.27');
  assert.equal(portfolioValue({offer_aggregates:[]}),null);
  assert.equal(portfolioValue({offer_aggregates:[{...top,offer_price:{token_unit:10,symbol:'USDC',chain:'ethereum'}},top]}),null);
  assert.equal(portfolioValue({offer_aggregates:[{...top,total_offers:0}]}),null);
});
test('missing offers and valuation lookup failures are distinct; listing failures cannot invent a Portfolio value',async()=>{
  for(const scenario of ['empty','offer-error','listing-error']){
    let offerCalls=0;const service=createPriceService({cache:cache(),openseaKey:'key',fetcher:async url=>{
      if(url.includes('/contract/'))return Response.json({address:contract,chain:'ethereum',collection:'test'});
      if(url.includes('/offer_aggregates')){offerCalls++;return scenario==='offer-error'?Response.json({}, {status:503}):Response.json({offer_aggregates:[]});}
      return Response.json({}, {status:scenario==='listing-error'?429:404});
    }});
    const result=await service.quote(asset);assert.equal(result.kind,scenario==='empty'?'NO_PORTFOLIO_VALUE':'UNAVAILABLE');assert.equal(result.value_eth,null);assert.equal(offerCalls,scenario==='listing-error'?0:1);
  }
});
test('shared collection valuation does not extend the age of its underlying quote',async()=>{
  let now=Date.now(),aggregateCalls=0;const service=createPriceService({cache:cache(),openseaKey:'key',now:()=>now,fetcher:async url=>{
    if(url.includes('/contract/'))return Response.json({address:contract,chain:'ethereum',collection:'test'});
    if(url.includes('/offer_aggregates')){aggregateCalls++;return Response.json({offer_aggregates:[{total_offers:1,offer_price:{token_unit:0.06,symbol:'WETH',chain:'ethereum'}}]});}
    return Response.json({}, {status:404});
  }});
  const first=await service.quote(asset);now+=50000;
  const next=await service.quote({...asset,id:contract+':2',token_id:'2'});assert.equal(next.expires_at,first.expires_at);assert.equal(aggregateCalls,1);
  now+=11000;await service.quote({...asset,id:contract+':2',token_id:'2'});assert.equal(aggregateCalls,2);
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
