import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWallets,normalizeNft,dedupeAssets,matchUtility} from '../dist/core.js';
const registry=JSON.parse(await readFile(new URL('../dist/registry.json',import.meta.url)));
const wallet='0x1234567890abcdef1234567890abcdef12345678';
test('wallet validation rejects invalid input and deduplicates case-insensitively',()=>{
  assert.deepEqual(normalizeWallets([wallet,wallet.toUpperCase().replace('0X','0x')]),[wallet]);
  assert.throws(()=>normalizeWallets(['0x123']));assert.throws(()=>normalizeWallets([]));assert.throws(()=>normalizeWallets(Array(21).fill(wallet)));assert.throws(()=>normalizeWallets([null]));
});
test('normalization filters unsupported contracts and preserves original vs expanded collections',()=>{
  assert.equal(normalizeNft({contract:{address:wallet},tokenId:'1'},wallet,registry.collections),null);
  for(const id of ['OTHERDEED','EXPANDED']){const c=registry.collections.find(c=>c.id===id);const a=normalizeNft({contract:{address:c.contract},tokenId:'42',image:{originalUrl:'ipfs://abc'},raw:{metadata:{attributes:[{trait_type:'Resource',value:'Ore'},null]}}},wallet,registry.collections);assert.equal(a.collection,id);assert.equal(a.owner_wallet,wallet);assert.equal(a.image,'https://ipfs.io/ipfs/abc');assert.equal(a.traits.length,1);}
});
test('metadata cannot introduce unsafe image schemes or duplicate assets',()=>{
  const c=registry.collections[0];const nft={contract:{address:c.contract},tokenId:'1',image:{originalUrl:'javascript:alert(1)'}};const a=normalizeNft(nft,wallet,registry.collections);assert.equal(a.image,'');assert.equal(dedupeAssets([a,a]).length,1);
});
test('matching keeps MAYC and BAYC requirements independent and never asserts final eligibility',()=>{
  const u=registry.utilities.find(u=>u.id==='bayc-avatar');const no=matchUtility(u,[{collection:'MAYC'}]);assert.equal(no.match_status,'NOT_MATCHED');const yes=matchUtility(u,[{collection:'BAYC'}]);assert.equal(yes.match_status,'OWNERSHIP_MATCHED');assert.equal(yes.additional_verification_required,true);
});
test('quantity and trait matching are supported, unknown rule types fail closed',()=>{
  const base={id:'test',collections:['KODA'],verification_level:'OWNERSHIP_ONLY'};
  assert.equal(matchUtility({...base,requirements:[{type:'MIN_QUANTITY',min:2}]},[{collection:'KODA'}]).match_status,'NOT_MATCHED');
  assert.equal(matchUtility({...base,requirements:[{type:'TRAIT_EXISTS',trait:'Type',value:'MegaKoda'}]},[{collection:'KODA',traits:[{trait_type:'Type',value:'MegaKoda'}]}]).match_status,'OWNERSHIP_MATCHED');
  assert.equal(matchUtility({...base,requirements:[{type:'UNKNOWN'}]},[{collection:'KODA'}]).match_status,'NOT_MATCHED');
});
test('unverifiable economy scenarios stay distinct from ownership matching',()=>{
  const u=registry.utilities.find(u=>u.id==='resource-economy');assert.equal(u.status,'SIMULATED');assert.equal(matchUtility(u,[{collection:'OTHERDEED'}]).match_status,'NOT_VERIFIABLE');
});
test('registry has safe external destinations and explicit source/verification states',()=>{
  for(const u of registry.utilities){assert.ok(['LIVE','ANNOUNCED','PLANNED','SIMULATED','UNAVAILABLE'].includes(u.status));assert.ok(u.destination_url.startsWith('https://'));assert.ok(u.source_url.startsWith('https://'));if(u.status==='LIVE'){assert.equal(u.source_type,'OFFICIAL');assert.ok(u.last_verified_at);}else if(u.source_type==='ASSUMPTION')assert.equal(u.status,'SIMULATED');}
  assert.equal(registry.collections.length,5);assert.equal(new Set(registry.collections.map(c=>c.contract.toLowerCase())).size,5);
});
