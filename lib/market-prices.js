const FRESH_MS=60000;
export function ethFromWei(value,decimals){
  if(decimals!==18||typeof value!=='string'||!/^\d{1,78}$/.test(value))return null;
  const wei=BigInt(value);const whole=wei/10n**18n;const fraction=(wei%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return whole.toString()+(fraction?'.'+fraction:'');
}
export function listingEth(data,now=Date.now()){
  if(!data||data.status!=='ACTIVE'||data.chain!=='ethereum')return null;
  const parameters=data.protocol_data?.parameters;
  if(parameters?.endTime&&(!Number.isFinite(Number(parameters.endTime))||Number(parameters.endTime)*1000<=now))return null;
  if(parameters?.startTime&&(!Number.isFinite(Number(parameters.startTime))||Number(parameters.startTime)*1000>now))return null;
  const current=data.price?.current;
  return current?.currency==='ETH'?ethFromWei(current.value,current.decimals):null;
}
export function createPriceService({cache,openseaKey,fetcher=fetch,now=()=>Date.now()}){
  const pending=new Map();
  async function request(endpoint,allow404=false){
    if(!openseaKey)throw new Error('NOT_CONFIGURED');
    const response=await fetcher('https://api.opensea.io/api/v2'+endpoint,{headers:{Accept:'application/json','x-api-key':openseaKey,'User-Agent':'OtherBridge/1.0'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(allow404&&response.status===404)return null;
    if(!response.ok)throw new Error('MARKET_UNAVAILABLE');
    const data=await response.json();if(!data||typeof data!=='object')throw new Error('INVALID_MARKET_RESPONSE');return data;
  }
  async function slugFor(contract){
    const key='market:collection:'+contract;if(pending.has(key))return pending.get(key);
    const promise=(async()=>{
      const previous=await cache.getMetadata(key);
      if(previous&&now()-Date.parse(previous.fetched_at)<86400000)return previous.value;
      const data=await request('/chain/ethereum/contract/'+contract);
      if(data.address?.toLowerCase()!==contract||data.chain!=='ethereum'||typeof data.collection!=='string'||!/^[a-z0-9][a-z0-9_-]{0,150}$/.test(data.collection))throw new Error('INVALID_COLLECTION');
      await cache.setMetadata(key,{value:data.collection,fetched_at:new Date(now()).toISOString()});return data.collection;
    })();
    pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
  }
  async function quote(asset,{force=false}={}){
    const key='market:buy-now:v2:'+asset.id;const previous=await cache.getMetadata(key);const age=previous?now()-Date.parse(previous.quoted_at):Infinity;
    if(!force&&previous&&age>=0&&age<(previous.kind==='UNAVAILABLE'?10000:FRESH_MS)&&(!previous.expires_at||Date.parse(previous.expires_at)>now()))return previous;
    const result={quote_schema:2,kind:'UNAVAILABLE',currency:'ETH',value_eth:null,source:'OpenSea',source_url:`https://opensea.io/item/ethereum/${asset.contract}/${asset.token_id}`,quoted_at:new Date(now()).toISOString(),stale:false,reason:'NO_ACTIVE_ETH_LISTING',expires_at:null};
    try{
      const slug=await slugFor(asset.contract);
      const listing=await request(`/listings/collection/${encodeURIComponent(slug)}/nfts/${encodeURIComponent(asset.token_id)}/best?include_private_listings=false`,true);
      const value=listingEth(listing,now());
      if(value!==null){
        const end=Number(listing.protocol_data?.parameters?.endTime)*1000;
        Object.assign(result,{kind:'LISTING',value_eth:value,reason:null,expires_at:Number.isFinite(end)&&end>0?new Date(end).toISOString():null});
      }else if(listing===null)Object.assign(result,{kind:'NOT_LISTED',reason:'NOT_LISTED'});
      else if(listing.price?.current?.currency&&listing.price.current.currency!=='ETH')Object.assign(result,{kind:'NON_ETH_LISTING',reason:'NON_ETH_LISTING'});
      else if(listing.status&&listing.status!=='ACTIVE'||listing.protocol_data?.parameters?.endTime&&Number(listing.protocol_data.parameters.endTime)*1000<=now())Object.assign(result,{kind:'NOT_LISTED',reason:'NO_ACTIVE_LISTING'});
    }catch{result.reason=openseaKey?'PROVIDER_UNAVAILABLE':'NOT_CONFIGURED';}
    result.quoted_at=new Date(now()).toISOString();await cache.setMetadata(key,result);return result;
  }
  return {quote};
}
