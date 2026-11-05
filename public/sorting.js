import {isCurrentBuyNow} from './prices.js';
export const SORT_OPTIONS=[['PRICE_DESC','가격순 · 높은 가격'],['RECENT','최근 취득순'],['TOKEN_ASC','토큰 번호순 · 낮은 번호']];
function tokenNumber(asset){try{return BigInt(asset.token_id);}catch{return null;}}
function compareKnown(a,b,descending=false){
  if(a==null||b==null)return a==null?(b==null?0:1):-1;
  return a===b?0:(a>b?1:-1)*(descending?-1:1);
}
function priceUnits(asset,now){
  const p=asset.market_price;
  if(!isCurrentBuyNow(p,now))return null;
  let value=String(p.value_eth);
  if(/e/i.test(value)){const n=Number(value);if(!Number.isFinite(n)||n<0)return null;value=n.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:18});}
  const match=/^(\d+)(?:\.(\d{1,18}))?$/.exec(value);if(!match)return null;
  return BigInt(match[1])*10n**18n+BigInt((match[2]||'').padEnd(18,'0'));
}
export function acquisitionTime(asset){const t=Date.parse(asset.acquired_at);return Number.isFinite(t)?t:null;}
export function sortAssets(assets,sort='PRICE_DESC',now=Date.now()){
  return [...assets].sort((a,b)=>{
    const primary=sort==='RECENT'?compareKnown(acquisitionTime(a),acquisitionTime(b),true):sort==='TOKEN_ASC'?compareKnown(tokenNumber(a),tokenNumber(b)):compareKnown(priceUnits(a,now),priceUnits(b,now),true);
    return primary||compareKnown(tokenNumber(a),tokenNumber(b))||String(a.id).localeCompare(String(b.id));
  });
}
