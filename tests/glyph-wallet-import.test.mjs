import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeGlyphWallets} from '../public/glyph-wallet-import.js';
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const status=(overrides={})=>({ready:true,signedIn:true,user:{evmWallet:address(1),smartWallet:address(2),linkedWallets:[{address:address(3)},{address:address(4)}]},...overrides});
test('authenticated Glyph primary, smart and already linked wallets are imported while keeping manual addresses',()=>{
  const manual={address:address(9),label:'My wallet',last_synced_at:'2026-01-01',demo:false};
  const result=mergeGlyphWallets([manual],status());
  assert.deepEqual(result.wallets.map(w=>w.address),[address(9),address(1),address(2),address(3),address(4)]);
  assert.equal(result.added.length,4);assert.deepEqual(result.wallets[0],manual);assert.ok(result.import_key);
});
test('case-insensitive duplicates preserve existing labels and sync timestamps; repeated status adds nothing',()=>{
  const addr='0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';const existing={address:addr.toUpperCase().replace('0X','0x'),label:'Named wallet',last_synced_at:'2026-01-01'};
  const profile=status({user:{evmWallet:addr,linkedWallets:[{address:addr.toUpperCase().replace('0X','0x')},{address:address(3)},{address:address(3)}]}});
  const first=mergeGlyphWallets([existing],profile);assert.equal(first.added.length,1);assert.equal(first.wallets[0].label,'Named wallet');assert.equal(first.wallets[0].last_synced_at,'2026-01-01');
  const repeated=mergeGlyphWallets(first.wallets,profile);assert.equal(repeated.added.length,0);assert.equal(repeated.import_key,first.import_key);
});
test('guest, unready and invalid identity states cannot import wallets',()=>{
  const wallets=[{address:address(9)}];
  for(const invalid of [status({signedIn:false}),status({ready:false}),status({user:{evmWallet:'bad',linkedWallets:[{address:address(3)}]}})]){
    const result=mergeGlyphWallets(wallets,invalid);assert.equal(result.wallets,wallets);assert.equal(result.added.length,0);assert.equal(result.import_key,null);
  }
});
test('non-EVM and malformed linked addresses are excluded; sample wallets are replaced by actual account addresses',()=>{
  const result=mergeGlyphWallets([{address:address(9),demo:true}],status({user:{evmWallet:address(1),linkedWallets:[null,{address:'SolanaPublicKey'},{address:'https://example.com'}, {address:address(3)},{}]}}));
  assert.deepEqual(result.wallets.map(w=>w.address),[address(1),address(3)]);assert.ok(result.wallets.every(w=>w.demo===false));
});
test('wallet limit keeps all existing wallets, adds available Glyph addresses and reports overflow',()=>{
  const existing=Array.from({length:19},(_,i)=>({address:address(100+i),label:'Keep '+i}));
  const result=mergeGlyphWallets(existing,status());assert.equal(result.wallets.length,20);assert.equal(result.added.length,1);assert.equal(result.skipped.length,3);
  assert.deepEqual(result.wallets.slice(0,19),existing);
});
test('account and linked-wallet changes produce new import keys without removing prior public addresses',()=>{
  const first=mergeGlyphWallets([],status());
  const changed=status({user:{evmWallet:address(10),linkedWallets:[{address:address(4)},{address:address(11)}]}});
  const next=mergeGlyphWallets(first.wallets,changed);assert.notEqual(next.import_key,first.import_key);assert.deepEqual(next.added.map(w=>w.address),[address(10),address(11)]);assert.equal(next.wallets.length,6);
});
