export const PRICE_REFRESH_MS=60000;
export function formatEth(value){
  if(typeof value!=='string'||!/^\d+(?:\.\d{1,18})?$/.test(value))return null;
  const [whole,fraction='']=value.split('.');const digits=fraction.replace(/0+$/,'');
  return BigInt(whole).toLocaleString('en-US')+(digits?'.'+digits:'');
}
export function isCurrentPrice(price,now=Date.now()){
  const age=now-Date.parse(price?.quoted_at);
  return price?.quote_schema===3&&['LISTING','PORTFOLIO_VALUE'].includes(price.kind)&&price.currency==='ETH'&&!price.stale&&formatEth(price.value_eth)!==null&&age>=0&&age<PRICE_REFRESH_MS&&(!price.expires_at||Date.parse(price.expires_at)>now);
}
export function sumAssetValues(assets,now=Date.now()){
  const unique=[...new Map(assets.map((asset,index)=>[asset.id??index,asset])).values()];
  let wei=0n,priced_count=0,estimated_count=0;
  for(const asset of unique){
    const price=asset.market_price;if(asset.demo||!isCurrentPrice(price,now))continue;
    const [whole,fraction='']=price.value_eth.split('.');
    wei+=BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));priced_count++;
    if(price.kind==='PORTFOLIO_VALUE')estimated_count++;
  }
  const fraction=(wei%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return {value_eth:priced_count||!unique.length?(wei/10n**18n).toString()+(fraction?'.'+fraction:''):null,priced_count,estimated_count,total_count:unique.length,unpriced_count:unique.length-priced_count};
}
export function pricePresentation(price,loading=false,now=Date.now()){
  if(!price||price.quote_schema!==3)return {amount:loading?'조회 중…':'—',available:false};
  if(isCurrentPrice(price,now))return {amount:formatEth(price.value_eth)+' ETH',available:true};
  if(loading)return {amount:'조회 중…',available:false};
  if(price.kind==='NO_PORTFOLIO_VALUE')return {amount:'평가 정보 없음',available:false};
  if(price.kind==='NON_ETH_LISTING')return {amount:'ETH 판매가 없음',available:false};
  return {amount:'가격 확인 불가',available:false};
}
