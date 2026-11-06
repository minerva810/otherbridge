import test from 'node:test';
import assert from 'node:assert/strict';
import {assetDetailLinks,renderAllTraits,currentAssetBenefits} from '../public/asset-details.js';
const asset={contract:'0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258',token_id:'8707',collection:'OTHERDEED',chain:'ethereum',demo:false,traits:[]};
test('NFT links use the exact Ethereum contract and token ID rather than owner wallet',()=>{
  const links=assetDetailLinks(asset);assert.equal(links.etherscan,'https://etherscan.io/nft/'+asset.contract+'/8707');assert.equal(links.opensea,'https://opensea.io/item/ethereum/'+asset.contract+'/8707');
  for(const invalid of [{demo:true},{chain:'base'},{contract:'javascript:alert(1)'},{token_id:'../1'},{token_id:(2n**256n).toString()}])assert.equal(assetDetailLinks({...asset,...invalid}),null);
});
test('all traits render, including zero and false; untrusted metadata remains escaped',()=>{
  const traits=Array.from({length:31},(_,i)=>({trait_type:'Property '+i,value:i}));traits.push({trait_type:'Koda',value:false},{trait_type:'<img onerror=alert(1)>',value:'<script>alert(1)</script>'});
  const html=renderAllTraits(traits);assert.equal((html.match(/class="asset-trait-row"/g)||[]).length,33);assert.ok(html.includes('Property 30'));assert.ok(html.includes('<dd>0</dd>'));assert.ok(html.includes('<dd>false</dd>'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(renderAllTraits([]).includes('조회된 Traits 정보가 없습니다.'));
});
test('benefits require matching ownership conditions, official source, current status and valid dates',()=>{
  const now=Date.parse('2026-11-06T12:00:00Z');
  const benefit={id:'verified',title:'Official benefit',collections:['OTHERDEED'],status:'LIVE',source_type:'OFFICIAL',source_url:'https://www.otherside.xyz/',last_verified_at:'2026-11-05',starts_at:'2026-11-01',ends_at:'2026-12-01',requirements:[{type:'OWN_COLLECTION',collection:'OTHERDEED'}],verification_level:'OWNERSHIP_ONLY'};
  const invalid=[{status:'SIMULATED'},{source_type:'ASSUMPTION'},{collections:['BAYC']},{ends_at:'2026-11-01'},{starts_at:'2026-12-01'},{last_verified_at:'invalid'},{source_url:'javascript:alert(1)'},{requirements:[]},{requirements:[{type:'UNKNOWN_RULE'}]}].map((extra,i)=>({...benefit,...extra,id:String(i)}));
  assert.deepEqual(currentAssetBenefits(asset,[benefit,...invalid],now).map(b=>b.id),['verified']);assert.deepEqual(currentAssetBenefits({...asset,demo:true},[benefit],now),[]);assert.deepEqual(currentAssetBenefits(asset,undefined,now),[]);
});
