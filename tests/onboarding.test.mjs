import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOnboarding} from '../public/onboarding-state.js';
const primary='0x1111111111111111111111111111111111111111';
const vault='0x2222222222222222222222222222222222222222';
const other='0x3333333333333333333333333333333333333333';
const contract='0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
const nft={id:contract+':1',collection:'BAYC',contract,token_id:'1',owner_wallet:vault,demo:false};
const base={ready:true,authenticated:true,user:{evmWallet:primary,linkedWallets:[{address:vault}]},wallets:[{address:vault}],assets:[nft]};
const check=(tokens=[],extra={})=>({BAYC:{status:'success',subject:primary,chainId:1,contractAddress:contract,tokens,delegationChain:[],...extra}});
test('unauthenticated visitors never receive verified linked or delegation statuses',()=>{
 const result=evaluateOnboarding({...base,authenticated:false,ownershipChecks:check([{id:1,owner:vault,delegated:true,linked:true}])});assert.equal(result.signedIn,false);assert.equal(result.rows[0].linked,'UNKNOWN');assert.equal(result.rows[0].nfts[0].delegation,'UNKNOWN');assert.equal(result.canContinue,false);
});
test('Wallet A: linked and delegated NFT has no repeated connect/delegate steps',()=>{
 const result=evaluateOnboarding({...base,ownershipChecks:check([{id:1,owner:vault,delegated:true,linked:true}])});const row=result.rows.find(r=>r.address===vault);assert.equal(row.linked,'LINKED');assert.equal(row.delegation,'DETECTED');assert.deepEqual(row.actions,[]);assert.equal(result.canContinue,true);
});
test('Wallet B: not linked gets connection action, not premature delegation instruction',()=>{
 const result=evaluateOnboarding({...base,user:{evmWallet:primary,linkedWallets:[]},ownershipChecks:check()});const row=result.rows.find(r=>r.address===vault);assert.equal(row.linked,'NOT_LINKED');assert.deepEqual(row.actions,['CONNECT']);assert.equal(result.canContinue,false);
});
test('Wallet C: linked but ownership resolver cannot access NFT gets delegation guidance',()=>{
 const result=evaluateOnboarding({...base,ownershipChecks:check()});const row=result.rows.find(r=>r.address===vault);assert.equal(row.linked,'LINKED');assert.equal(row.delegation,'REQUIRED');assert.deepEqual(row.actions,['DELEGATE']);assert.equal(result.canContinue,false);
});
test('linked access and direct ownership do not force unnecessary delegation',()=>{
 const linked=evaluateOnboarding({...base,ownershipChecks:check([{id:1,owner:vault,delegated:false,linked:true}])});assert.equal(linked.rows[0].delegation,'NOT_REQUIRED');assert.equal(linked.canContinue,true);
 const direct=evaluateOnboarding({...base,assets:[{...nft,owner_wallet:primary}]});assert.equal(direct.rows.find(r=>r.address===primary).delegation,'NOT_REQUIRED');assert.equal(direct.canContinue,true);
});
test('missing linkedWallets and ownership errors stay unknown',()=>{
 const result=evaluateOnboarding({...base,user:{evmWallet:primary},ownershipChecks:{BAYC:{status:'error',error:'network unavailable'}}});const row=result.rows.find(r=>r.address===vault);assert.equal(row.linked,'UNKNOWN');assert.equal(row.delegation,'UNKNOWN');assert.deepEqual(row.actions,['RECHECK']);assert.equal(result.canContinue,false);
});
test('delegation matches chain, contract, owner and token; other assets cannot satisfy it',()=>{
 for(const result of [check([{id:2,owner:vault,delegated:true,linked:true}]),check([{id:1,owner:other,delegated:true,linked:true}]),check([{id:1,owner:vault,delegated:true,linked:true}],{chainId:33139}),check([{id:1,owner:vault,delegated:true,linked:true}],{contractAddress:other})]){const evaluated=evaluateOnboarding({...base,ownershipChecks:result});assert.equal(evaluated.canContinue,false);assert.notEqual(evaluated.rows.find(r=>r.address===vault).delegation,'DETECTED');}
});
test('partial token delegation does not mark the whole wallet complete',()=>{
 const result=evaluateOnboarding({...base,assets:[nft,{...nft,id:contract+':2',token_id:'2'}],ownershipChecks:check([{id:1,owner:vault,delegated:true,linked:true}])});assert.equal(result.ready_assets,1);assert.equal(result.canContinue,false);assert.ok(result.rows[0].actions.includes('DELEGATE'));
});
test('demo data, a cached self-check, and in-flight results never mark onboarding ready',()=>{
 assert.equal(evaluateOnboarding({...base,assets:[{...nft,demo:true}],ownershipChecks:check()}).asset_count,0);
 assert.equal(evaluateOnboarding({...base,guideSteps:[true,true,true]}).canContinue,false);
 assert.equal(evaluateOnboarding({...base,checking:true,ownershipChecks:check([{id:1,owner:vault,delegated:true,linked:true}])}).canContinue,false);
});
test('logout and account changes cannot reuse previous user state',()=>{
 const loggedOut=evaluateOnboarding({...base,authenticated:false});assert.equal(loggedOut.canContinue,false);assert.equal(loggedOut.rows.some(r=>r.ready),false);
 const changed=evaluateOnboarding({...base,user:{evmWallet:other,linkedWallets:[]},ownershipChecks:check([{id:1,owner:vault,delegated:true,linked:true}])});assert.equal(changed.rows.find(r=>r.address===vault).linked,'NOT_LINKED');assert.equal(changed.canContinue,false);
});
test('Glyph smart wallet ownership does not require delegation to itself',()=>{
 const result=evaluateOnboarding({...base,user:{evmWallet:primary,smartWallet:vault,linkedWallets:[]}});assert.equal(result.rows.find(r=>r.address===vault).delegation,'NOT_REQUIRED');assert.equal(result.canContinue,true);
});
test('a queried wallet without supported NFTs does not receive repeated setup actions',()=>{
 const result=evaluateOnboarding({...base,wallets:[{address:vault,last_synced_at:'2026-11-06T00:00:00Z'}],assets:[],ownershipChecks:check()});const row=result.rows.find(r=>r.address===vault);assert.equal(row.queried,true);assert.deepEqual(row.actions,[]);assert.equal(result.canContinue,false);
});
