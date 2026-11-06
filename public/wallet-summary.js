import {sumAssetValues} from './prices.js';

export function summarizeWallet(wallet,assets,{pending=new Set(),now=Date.now()}={}){
  const owner=wallet.address.toLowerCase();
  const owned=assets.filter(a=>a.owner_wallet?.toLowerCase()===owner&&Boolean(a.demo)===Boolean(wallet.demo));
  const totals=sumAssetValues(owned,now);
  const queried=Boolean(wallet.demo||Number.isFinite(Date.parse(wallet.last_synced_at))||owned.length);
  return {...totals,nft_count:queried?totals.total_count:null,value_eth:queried&&!wallet.demo?totals.value_eth:null,
    pending_count:owned.filter(a=>pending.has(a.id)).length,queried,demo:Boolean(wallet.demo),stale:Boolean(wallet.holdings_stale)};
}
