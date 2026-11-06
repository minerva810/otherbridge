import {EVM_ADDRESS,matchUtility} from './core.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function assetDetailLinks(asset){
  if(asset.demo||asset.chain!=='ethereum'||!EVM_ADDRESS.test(asset.contract||'')||!/^\d{1,78}$/.test(String(asset.token_id)))return null;
  const contract=asset.contract.toLowerCase();const token=String(asset.token_id);
  if(BigInt(token)>2n**256n-1n)return null;
  return {opensea:`https://opensea.io/item/ethereum/${contract}/${token}`,etherscan:`https://etherscan.io/nft/${contract}/${token}`};
}
export function renderAllTraits(traits){
  const entries=Array.isArray(traits)?traits.filter(t=>t&&typeof t.trait_type==='string'&&['string','number','boolean'].includes(typeof t.value)):[];
  return entries.length?'<dl class="asset-trait-list">'+entries.map(t=>'<div class="asset-trait-row"><dt>'+esc(t.trait_type)+'</dt><dd>'+esc(t.value)+'</dd></div>').join('')+'</dl>':'<p class="asset-detail-empty">조회된 Traits 정보가 없습니다.</p>';
}
export function currentAssetBenefits(asset,benefits=[],now=Date.now()){
  if(asset.demo||!Array.isArray(benefits))return [];
  return benefits.filter(b=>{
    if(b?.status!=='LIVE'||b.source_type!=='OFFICIAL'||!Array.isArray(b.collections)||!b.collections.includes(asset.collection)||!Number.isFinite(Date.parse(b.last_verified_at))||Date.parse(b.last_verified_at)>now)return false;
    if(b.starts_at&&(!Number.isFinite(Date.parse(b.starts_at))||Date.parse(b.starts_at)>now))return false;
    if(b.ends_at&&(!Number.isFinite(Date.parse(b.ends_at))||Date.parse(b.ends_at)<=now))return false;
    try{if(new URL(b.source_url).protocol!=='https:')return false;}catch{return false;}
    if(!Array.isArray(b.requirements)||!b.requirements.length)return false;
    return matchUtility(b,[asset]).match_status!=='NOT_MATCHED';
  });
}
