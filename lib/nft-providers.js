import {normalizeNft, dedupeAssets, safeImageUrl} from '../public/core.js';

export class ProviderError extends Error {
  constructor(provider,code,status=502,detail=''){
    const reason={NOT_CONFIGURED:'API 키가 설정되지 않았습니다.',UNAUTHORIZED:'API 키 인증에 실패했습니다. 서버 설정을 확인하세요.',RATE_LIMITED:'요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.',TIMEOUT:'응답 시간이 초과되었습니다.',INVALID_RESPONSE:'응답 형식이 올바르지 않습니다.',PAGINATION_LIMIT:'조회 범위를 초과해 결과가 완결되지 않았습니다.',UPSTREAM_ERROR:'서비스 응답 오류가 발생했습니다.',NOT_FOUND:'자산을 찾지 못했습니다.'}[code]||'조회에 실패했습니다.';
    super(`${provider}: ${reason}${detail?' ('+detail+')':''}`);this.provider=provider;this.code=code;this.status=status;
  }
}
async function jsonRequest(fetcher,url,provider,headers={}) {
  let response;
  try{response=await fetcher(String(url),{headers:{Accept:'application/json','User-Agent':'OtherBridge/1.0',...headers},signal:AbortSignal.timeout(15000),redirect:'manual'});}catch(error){
    throw new ProviderError(provider,error.name==='TimeoutError'?'TIMEOUT':'UPSTREAM_ERROR');
  }
  if(!response.ok)throw new ProviderError(provider,[401,403].includes(response.status)?'UNAUTHORIZED':response.status===429?'RATE_LIMITED':response.status===404?'NOT_FOUND':'UPSTREAM_ERROR',response.status===429?429:502,`HTTP ${response.status}`);
  try{return await response.json();}catch{throw new ProviderError(provider,'INVALID_RESPONSE');}
}
export async function alchemyOwnership(owner,collections,{alchemyKey,fetcher=fetch}={}) {
  if(!alchemyKey)throw new ProviderError('Alchemy','NOT_CONFIGURED',503);
  const assets=[];const seen=new Set();let cursor;
  for(let page=0;page<100;page++){
    const url=new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${encodeURIComponent(alchemyKey)}/getNFTsForOwner`);
    url.searchParams.set('owner',owner);url.searchParams.set('orderBy','transferTime');url.searchParams.set('withMetadata','true');url.searchParams.set('pageSize','100');
    collections.forEach(c=>url.searchParams.append('contractAddresses[]',c.contract));if(cursor)url.searchParams.set('pageKey',cursor);
    const data=await jsonRequest(fetcher,url,'Alchemy');if(!Array.isArray(data.ownedNfts))throw new ProviderError('Alchemy','INVALID_RESPONSE');
    assets.push(...data.ownedNfts.map(nft=>normalizeNft(nft,owner,collections)).filter(Boolean));
    if(!data.pageKey)return dedupeAssets(assets);
    if(typeof data.pageKey!=='string'||seen.has(data.pageKey))throw new ProviderError('Alchemy','INVALID_RESPONSE');
    seen.add(data.pageKey);cursor=data.pageKey;
  }
  throw new ProviderError('Alchemy','PAGINATION_LIMIT',422);
}
export function normalizeOpenSea(nft,owner,collections) {
  if(!nft||typeof nft!=='object')return null;
  const contract=typeof nft.contract==='string'?nft.contract:nft.contract?.address;
  const a=normalizeNft({contract:{address:contract},tokenId:nft.identifier??nft.token_id,name:nft.name,description:nft.description,image:{originalUrl:nft.display_image_url||nft.image_url},raw:{metadata:{attributes:nft.traits||nft.attributes}}},owner,collections);
  return a?{...a,ownership_source:'opensea',metadata_sources:['opensea']}:null;
}
export async function openseaOwnership(owner,collections,{openseaKey,fetcher=fetch}={}) {
  if(!openseaKey)throw new ProviderError('OpenSea','NOT_CONFIGURED',503);
  const assets=[];const seen=new Set();let cursor;
  for(let page=0;page<100;page++){
    const url=new URL(`https://api.opensea.io/api/v2/chain/ethereum/account/${owner}/nfts`);url.searchParams.set('limit','200');url.searchParams.set('include_auto_hidden','true');if(cursor)url.searchParams.set('next',cursor);
    const data=await jsonRequest(fetcher,url,'OpenSea',{'x-api-key':openseaKey});if(!Array.isArray(data.nfts))throw new ProviderError('OpenSea','INVALID_RESPONSE');
    assets.push(...data.nfts.map(nft=>normalizeOpenSea(nft,owner,collections)).filter(Boolean));
    if(!data.next)return dedupeAssets(assets);
    if(typeof data.next!=='string'||seen.has(data.next))throw new ProviderError('OpenSea','INVALID_RESPONSE');seen.add(data.next);cursor=data.next;
  }
  throw new ProviderError('OpenSea','PAGINATION_LIMIT',422);
}
export async function openseaMetadata(contract,tokenId,{openseaKey,fetcher=fetch}={}) {
  if(!openseaKey)throw new ProviderError('OpenSea','NOT_CONFIGURED',503);
  const url=`https://api.opensea.io/api/v2/chain/ethereum/contract/${contract}/nfts/${encodeURIComponent(tokenId)}`;
  const data=await jsonRequest(fetcher,url,'OpenSea',{'x-api-key':openseaKey});const nft=data.nft;
  if(!nft||typeof nft!=='object'||String(nft.identifier??nft.token_id)!==String(tokenId))throw new ProviderError('OpenSea','INVALID_RESPONSE');
  if(nft.contract&&String(typeof nft.contract==='string'?nft.contract:nft.contract.address).toLowerCase()!==contract.toLowerCase())throw new ProviderError('OpenSea','INVALID_RESPONSE');
  return {name:String(nft.name||'').slice(0,250),description:String(nft.description||'').slice(0,2000),image:safeImageUrl(nft.display_image_url||nft.image_url),traits:Array.isArray(nft.traits)?nft.traits.filter(t=>t&&typeof t.trait_type==='string'&&['string','number','boolean'].includes(typeof t.value)).map(t=>({trait_type:t.trait_type,value:t.value})):[],last_metadata_synced_at:new Date().toISOString(),metadata_source:'opensea'};
}
export function mergeMetadata(asset,metadata) {
  return {...asset,name:asset.name||metadata.name,description:asset.description||metadata.description,image:asset.image||metadata.image,traits:asset.traits?.length?asset.traits:metadata.traits,metadata_sources:[...new Set([...(asset.metadata_sources||[]),metadata.metadata_source])],last_metadata_synced_at:metadata.last_metadata_synced_at};
}
export async function mapLimit(items,limit,callback) {
  const output=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(next<items.length){const i=next++;output[i]=await callback(items[i],i);}}));return output;
}
export async function fillAcquisitionTimes(assets,owner,{alchemyKey,fetcher=fetch}={}){
  const missing=new Map(assets.filter(a=>!a.acquired_at).map(a=>[a.id,a]));
  if(!alchemyKey||!missing.size)return assets;
  const dates=new Map();const cursors=new Set();let cursor;
  try{
    for(let page=0;page<5&&dates.size<missing.size;page++){
      const filter={fromBlock:'0x0',toBlock:'latest',toAddress:owner,contractAddresses:[...new Set(assets.map(a=>a.contract))],category:['erc721','erc1155'],withMetadata:true,order:'desc',maxCount:'0x3e8',excludeZeroValue:true,...(cursor?{pageKey:cursor}:{})};
      const response=await fetcher(`https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(alchemyKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[filter]}),signal:AbortSignal.timeout(15000),redirect:'manual'});
      if(!response.ok)break;const data=await response.json();if(!Array.isArray(data.result?.transfers))break;
      for(const transfer of data.result.transfers){
        if(transfer.to?.toLowerCase()!==owner.toLowerCase())continue;
        const timestamp=transfer.metadata?.blockTimestamp;if(!Number.isFinite(Date.parse(timestamp)))continue;
        const tokens=transfer.category==='erc1155'?(transfer.erc1155Metadata||[]).map(t=>t.tokenId):[transfer.tokenId??transfer.erc721TokenId];
        for(const token of tokens){try{if(token==null)continue;const id=transfer.rawContract?.address?.toLowerCase()+':'+BigInt(token).toString();if(missing.has(id)&&!dates.has(id))dates.set(id,new Date(timestamp).toISOString());}catch{/* Invalid transfer token. */}}
      }
      cursor=data.result.pageKey;if(!cursor||cursors.has(cursor))break;cursors.add(cursor);
    }
  }catch{/* Optional transfer lookup cannot discard verified holdings. */}
  return assets.map(a=>dates.has(a.id)?{...a,acquired_at:dates.get(a.id)}:a);
}
export function createNftService({collections,cache,alchemyKey,openseaKey,fetcher=fetch,now=()=>Date.now()}) {
  const options={alchemyKey,openseaKey,fetcher};
  async function enrich(asset,force=false) {
    if(!openseaKey)return asset;
    try{
      let metadata=await cache.getMetadata(asset.id);
      if(force||!metadata||now()-Date.parse(metadata.last_metadata_synced_at)>6*60*60*1000){metadata=await openseaMetadata(asset.contract,asset.token_id,options);await cache.setMetadata(asset.id,metadata);}
      return mergeMetadata(asset,metadata);
    }catch(e){return {...asset,metadata_warning:e instanceof ProviderError?e.message:'OpenSea 메타데이터를 불러오지 못했습니다.'};}
  }
  async function wallet(address,{force=false}={}) {
    const cached=await cache.getWallet(address);
    if(!force&&cached?.ownership_schema===3&&now()-Date.parse(cached.last_synced_at)<10*60*1000)return {...cached,cached:true,stale:false};
    try{
      let assets;let warning=null;
      try{assets=await alchemyOwnership(address,collections,options);}catch(error){
        if(!openseaKey)throw error;
        try{assets=await openseaOwnership(address,collections,options);}catch(secondary){throw new ProviderError('NFT providers','UPSTREAM_ERROR',secondary.status||502,`${error.message} / ${secondary.message}`);}warning=`${error.message} OpenSea 보유 조회 결과를 표시합니다.`;
      }
      assets=await fillAcquisitionTimes(assets,address,options);
      let enriched=0;
      assets=await mapLimit(assets,4,async asset=>{
        if((!asset.image||!asset.traits.length)&&enriched++<24)return enrich(asset);
        return asset;
      });
      const result={assets,ownership_schema:3,last_synced_at:new Date(now()).toISOString(),ownership_sources:[...new Set(assets.map(a=>a.ownership_source))],warning};
      await cache.setWallet(address,result);return {...result,cached:false,stale:false};
    }catch(error){
      if(cached&&now()-Date.parse(cached.last_synced_at)<24*60*60*1000)return {...cached,cached:true,stale:true,warning:`${error.message} 최근 캐시를 표시합니다. 소유 정보가 변경되었을 수 있습니다.`};
      throw error;
    }
  }
  return {wallet,enrich,async portfolio(addresses,options={}){
    const results=await mapLimit(addresses,3,address=>wallet(address,options));
    const assets=dedupeAssets(results.flatMap(r=>r.assets));
    return {wallet_count:addresses.length,asset_count:assets.length,assets,collections:Object.fromEntries(collections.map(c=>[c.id,assets.filter(a=>a.collection===c.id).length])),wallets:addresses.map((address,i)=>({address,last_synced_at:results[i].last_synced_at,cached:results[i].cached,stale:results[i].stale})),last_synced_at:results.map(r=>r.last_synced_at).sort()[0],stale:results.some(r=>r.stale),cached:results.every(r=>r.cached),warning:[...new Set(results.map(r=>r.warning).filter(Boolean))].join(' ')||null};
  }};
}
