import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LinkedWalletCards} from '../client/linked-wallet-cards.js';
const wallet=n=>'0x'+String(n).repeat(40);
const row=(n,linked,count=0)=>({address:wallet(n),linked,asset_count:count,nfts:Array.from({length:count},(_,i)=>({id:String(i),collection:'MAYC',token_id:String(25000+i),delegation:'UNKNOWN'})),actions:['DELEGATE','LOAD_ASSETS','RECHECK']});
const render=rows=>renderToStaticMarkup(React.createElement(LinkedWalletCards,{rows,onLink:()=>{}}));
test('wallet cards only show address and linked state; 31 NFTs do not create an asset list',()=>{
  const html=render([row(1,'NOT_LINKED',31),row(2,'LINKED'),row(3,'UNKNOWN',10)]);
  assert.equal((html.match(/class="glyph-wallet-card"/g)||[]).length,3);
  assert.equal((html.match(/class="glyph-state-line /g)||[]).length,3);
  assert.ok(html.includes('Glyph linked'));assert.ok(html.includes('Not linked'));assert.ok(html.includes('Linked status unverified'));
  for(const removed of ['MAYC','25000','31 NFTs','Delegation','Set up delegation','glyph-wallet-count','glyph-no-assets'])assert.ok(!html.includes(removed),removed+' should not be rendered');
  assert.ok(html.includes('title="'+wallet(1)+'"'));assert.ok(html.includes('Wallet A'));
});
test('unlinked and unknown wallets have connection actions; linked wallets do not repeat setup',()=>{
  assert.ok(render([row(1,'NOT_LINKED')]).includes('Connect to Glyph'));
  assert.ok(render([row(2,'UNKNOWN')]).includes('Glyph에서 연결 지갑 확인'));
  assert.ok(!render([row(3,'LINKED',1000)]).includes('<button'));
  assert.equal(render([row(3,'LINKED',31)]),render([row(3,'LINKED',1000)]),'card markup does not grow with owned NFT count');
});
