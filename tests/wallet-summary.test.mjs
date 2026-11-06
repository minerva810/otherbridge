import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeWallet} from '../public/wallet-summary.js';
const now=Date.now(),owner='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40);
const wallet={address:owner,last_synced_at:new Date(now).toISOString()};
const asset=(id,owner_wallet,value,kind='LISTING')=>({id,owner_wallet,demo:false,market_price:{quote_schema:3,kind,currency:'ETH',value_eth:value,quoted_at:new Date(now).toISOString()}});

test('wallet totals isolate owners case-insensitively, deduplicate NFTs and retain exact ETH precision',()=>{
  const first=asset('1',owner.toUpperCase(),'1.123456789123456789');
  const assets=[first,{...first},asset('2',owner,'0.000000000000000001','PORTFOLIO_VALUE'),asset('3',other,'100'),{...asset('demo',owner,'500'),demo:true}];
  const total=summarizeWallet(wallet,assets,{now});
  assert.equal(total.nft_count,2);assert.equal(total.value_eth,'1.12345678912345679');assert.equal(total.priced_count,2);assert.equal(total.estimated_count,1);
  assert.equal(summarizeWallet({address:other},assets,{now}).value_eth,'100');
});
test('unqueried wallets, successful empty holdings, sample holdings and stale holdings remain distinguishable',()=>{
  assert.equal(summarizeWallet({address:owner},[],{now}).nft_count,null);
  assert.equal(summarizeWallet({address:owner},[],{now}).value_eth,null);
  assert.equal(summarizeWallet(wallet,[],{now}).nft_count,0);assert.equal(summarizeWallet(wallet,[],{now}).value_eth,'0');
  const sample=summarizeWallet({...wallet,demo:true},[{id:'sample',owner_wallet:owner,demo:true}],{now});assert.equal(sample.nft_count,1);assert.equal(sample.value_eth,null);assert.equal(sample.demo,true);
  assert.equal(summarizeWallet({...wallet,holdings_stale:true},[],{now}).stale,true);
});
test('missing or expired quotes cannot masquerade as zero; partial totals disclose unpriced and pending NFTs',()=>{
  const expired=asset('expired',owner,'100');expired.market_price.quoted_at=new Date(now-61000).toISOString();
  const missing={id:'missing',owner_wallet:owner};
  const total=summarizeWallet(wallet,[asset('good',owner,'2.25'),expired,missing],{now,pending:new Set(['missing'])});
  assert.equal(total.nft_count,3);assert.equal(total.value_eth,'2.25');assert.equal(total.unpriced_count,2);assert.equal(total.pending_count,1);
  assert.equal(summarizeWallet(wallet,[expired,missing],{now}).value_eth,null);
});
