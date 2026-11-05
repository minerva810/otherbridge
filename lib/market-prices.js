const ETH_DECIMALS=18;
const FRESH_MS=5*60*1000;
const MAX_STALE_MS=60*60*1000;
export function ethFromWei(value,decimals){
  if(decimals!==ETH_DECIMALS||typeof value!=='string'||!/^\d{1,78}$/.test(value))return null;
  const wei=BigInt(value);const whole=wei/10n**18n;const fraction=(wei%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return whole.toString()+(fraction?'.'+fraction:'');
}
export function listingEth(data,now=Date.now()){
  if(!data||data.status&&data.status!=='ACTIVE'||data.chain&&data.chain!=='ethereum')return null;
  const parameters=data.protocol_data?.parameters;
  if(parameters?.endTime&&Number(parameters.endTime)*1000<=now)return null;
  if(parameters?.startTime&&Number(parameters.startTime)*1000>now)return null;
  const current=data.price?.current;
  if(current?.currency!=='ETH')return null;
  return ethFromWei(current.value,current.decimals);
}
export function collectionFloorEth(data){
  const total=data?.total;if(total?.floor_price_symbol!=='ETH')return null;
  const value=Number(total.floor_price);return Number.isFinite(value)&&value>0?String(value):null;
}
export function createPriceService({cache,openseaKey,fetcher=fetch,now=()=>Date.now()}){
  const pending=new Map();
  async function request(endpoint,allow404=false){
    if(!openseaKey)throw new Error('NOT_CONFIGURED');
    let response;try{response=await fetcher('https://api.opensea.io/api/v2'+endpoint,{headers:{Accept:'application/json','x-api-key':openseaKey,'User-Agent':'OtherBridge/1.0'},redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{throw new Error('MARKET_UNAVAILABLE');}
    if(allow404&&response.status===404)return null;
    if(!response.ok)throw new Error('MARKET_UNAVAILABLE');
    try{return await response.json();}catch{throw new Error('MARKET_UNAVAILABLE');}
  }
  async function cachedValue(key,ttl,load,force=false){
    if(pending.has(key))return pending.get(key);
    const promise=(async()=>{const previous=await cache.getMetadata(key);if(!force&&previous&&now()-Date.parse(previous.fetched_at)<ttl)return previous.value;const value=await load();await cache.setMetadata(key,{value,fetched_at:new Date(now()).toISOString()});return value;})();
    pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
  }
  async function slugFor(contract){
    return cachedValue('market:collection:'+contract,24*60*60*1000,async()=>{
      const data=await request('/chain/ethereum/contract/'+contract);
      if(data.address?.toLowerCase()!==contract||data.chain!=='ethereum'||typeof data.collection!=='string'||!/^[a-z0-9][a-z0-9_-]{0,150}$/.test(data.collection))throw new Error('INVALID_COLLECTION');
      return data.collection;
    });
  }
  async function quote(asset,{force=false}={}){
    const key='market:asset:'+asset.id;const previous=await cache.getMetadata(key);
    const age=previous?now()-Date.parse(previous.quoted_at):Infinity;
    if(!force&&previous&&age<(previous.kind==='UNAVAILABLE'?30000:FRESH_MS))return previous;
    const result={kind:'UNAVAILABLE',currency:'ETH',value_eth:null,source:'OpenSea',source_url:`https://opensea.io/assets/ethereum/${asset.contract}/${asset.token_id}`,quoted_at:new Date(now()).toISOString(),stale:false,reason:'NO_ETH_QUOTE'};
    let upstreamFailed=false;
    try{
      const slug=await slugFor(asset.contract);
      let listing=null;
      try{listing=await request(`/listings/collection/${encodeURIComponent(slug)}/nfts/${encodeURIComponent(asset.token_id)}/best`,true);}catch{upstreamFailed=true;}
      const sale=listingEth(listing,now());
      if(sale!==null){Object.assign(result,{kind:'LISTING',value_eth:sale,reason:null});}
      else{
        let floor=null;try{floor=await cachedValue('market:floor:'+slug,FRESH_MS,()=>request(`/collections/${encodeURIComponent(slug)}/stats`),force);}catch{upstreamFailed=true;}
        const value=collectionFloorEth(floor);
        if(value!==null)Object.assign(result,{kind:'COLLECTION_FLOOR',value_eth:value,source_url:`https://opensea.io/collection/${encodeURIComponent(slug)}`,reason:upstreamFailed?'LISTING_UNVERIFIED':listing?'NO_ACTIVE_ETH_LISTING':'NOT_LISTED'});
      }
    }catch{upstreamFailed=true;}
    if(result.kind==='UNAVAILABLE'&&upstreamFailed){
      if(previous&&previous.kind!=='UNAVAILABLE'&&age<MAX_STALE_MS)return {...previous,stale:true,reason:'PROVIDER_UNAVAILABLE'};
      result.reason=openseaKey?'PROVIDER_UNAVAILABLE':'NOT_CONFIGURED';
    }
    await cache.setMetadata(key,result);return result;
  }
  return {quote};
}
