export function formatEth(value){
  const number=Number(value);if(!Number.isFinite(number)||number<0)return null;
  if(number>0&&number<0.000001)return '<0.000001';
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(number);
}
export function pricePresentation(price,loading=false){
  if(!price)return {label:'가격',amount:loading?'조회 중…':'—',available:false};
  const value=price.currency==='ETH'?formatEth(price.value_eth):null;
  if(price.value_eth==null||value===null||!['LISTING','COLLECTION_FLOOR'].includes(price.kind))return {label:'가격',amount:'정보 없음',available:false};
  return {label:price.kind==='LISTING'?'판매가':'컬렉션 바닥가',amount:value+' ETH',available:true};
}
