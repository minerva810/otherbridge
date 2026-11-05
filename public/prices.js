export const PRICE_REFRESH_MS=60000;
export function formatEth(value){
  if(typeof value!=='string'||!/^\d+(?:\.\d{1,18})?$/.test(value))return null;
  const [whole,fraction='']=value.split('.');const digits=fraction.replace(/0+$/,'');
  return BigInt(whole).toLocaleString('en-US')+(digits?'.'+digits:'');
}
export function isCurrentBuyNow(price,now=Date.now()){
  const age=now-Date.parse(price?.quoted_at);
  return price?.quote_schema===2&&price.kind==='LISTING'&&price.currency==='ETH'&&!price.stale&&formatEth(price.value_eth)!==null&&age>=0&&age<PRICE_REFRESH_MS&&(!price.expires_at||Date.parse(price.expires_at)>now);
}
export function pricePresentation(price,loading=false,now=Date.now()){
  if(!price||price.quote_schema!==2)return {label:'Buy now',amount:loading?'조회 중…':'—',available:false};
  if(isCurrentBuyNow(price,now))return {label:'Buy now',amount:formatEth(price.value_eth)+' ETH',available:true};
  if(loading)return {label:'Buy now',amount:'조회 중…',available:false};
  if(price.kind==='NOT_LISTED')return {label:'Buy now',amount:'판매 등록 없음',available:false};
  if(price.kind==='NON_ETH_LISTING')return {label:'Buy now',amount:'ETH 판매가 없음',available:false};
  return {label:'Buy now',amount:'가격 확인 불가',available:false};
}
