import {normalizeWallets,EVM_ADDRESS,matchUtility} from '../public/core.js';
import {createNftService,ProviderError} from './nft-providers.js';

const allowedEvents=new Set(['wallet_added','portfolio_loaded','asset_clicked','utility_viewed','utility_action_clicked','guide_started','guide_step_completed','official_link_clicked','glyph_link_clicked','otherside_link_clicked','glyph_login_completed','glyph_logout','glyph_status_checked','glyph_signup_started','glyph_wallet_link_started','glyph_delegation_started']);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('JSON 요청이 필요합니다.'),{status:400});
  const decoder=new TextDecoder();let text='';let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>64000){await reader.cancel();throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();try{return JSON.parse(text);}catch{throw Object.assign(new Error('올바른 JSON 요청이 필요합니다.'),{status:400});}
}
export function createBridgeApi({registry,cache,alchemyKey,openseaKey,fetcher=fetch,recordEvent=async()=>{}}){
  const service=createNftService({collections:registry.collections,cache,alchemyKey,openseaKey,fetcher});
  return async function handle(request){
    const url=new URL(request.url);const route=url.pathname;
    try{
      if(route==='/api/v1/health'&&request.method==='GET')return json({service:'other-bridge',alchemy_configured:Boolean(alchemyKey),opensea_configured:Boolean(openseaKey),read_only:true,providers:{ownership:alchemyKey?'alchemy':openseaKey?'opensea':null,metadata:openseaKey?'opensea':null}});
      if(route==='/api/v1/portfolio/resolve'&&request.method==='POST'){
        const data=await readBody(request);let addresses;try{addresses=normalizeWallets(data.wallets);}catch(error){return json({error:error.message},400);}
        return json(await service.portfolio(addresses,{force:data.force===true}));
      }
      if(route.startsWith('/api/v1/assets/')&&request.method==='GET'){
        const id=decodeURIComponent(route.slice('/api/v1/assets/'.length));
        const [contract,tokenId,...extra]=id.split(':');
        if(extra.length||!EVM_ADDRESS.test(contract)||!/^\d+$/.test(tokenId)||!registry.collections.some(c=>c.contract.toLowerCase()===contract.toLowerCase()))return json({error:'지원 자산의 contract:token_id가 필요합니다.'},400);
        const owner=url.searchParams.get('owner')?.toLowerCase();if(!EVM_ADDRESS.test(owner||''))return json({error:'조회할 지갑 주소가 필요합니다.'},400);
        const result=await service.wallet(owner);const found=result.assets.find(a=>a.id.toLowerCase()===id.toLowerCase());
        if(!found)return json({error:'이 지갑에서 해당 자산을 찾을 수 없습니다.'},404);
        const asset=await service.enrich(found,url.searchParams.get('refresh')==='true');
        const updated={...result,assets:result.assets.map(a=>a.id===asset.id?asset:a)};await cache.setWallet(owner,updated);
        return json({asset,stale:result.stale,warning:result.warning||asset.metadata_warning||null,utilities:registry.utilities.filter(u=>u.collections.includes(asset.collection)).map(u=>({...u,match:matchUtility(u,[asset])}))});
      }
      if(route==='/api/v1/utilities/match'&&request.method==='POST'){
        const data=await readBody(request);if(!Array.isArray(data.assets)||data.assets.length>10000||data.assets.some(a=>!a||typeof a.collection!=='string'||a.traits!=null&&!Array.isArray(a.traits)))return json({error:'올바른 자산 목록이 필요합니다.'},400);
        return json({matches:registry.utilities.map(utility=>({utility,...matchUtility(utility,data.assets)})).sort((a,b)=>Number(b.utility.status==='LIVE')-Number(a.utility.status==='LIVE'))});
      }
      if(route.startsWith('/api/v1/utilities/')&&request.method==='GET'){
        const utility=registry.utilities.find(u=>u.id===decodeURIComponent(route.split('/').pop()));return json(utility||{error:'유틸리티를 찾을 수 없습니다.'},utility?200:404);
      }
      if(route==='/api/v1/events'&&request.method==='POST'){
        const data=await readBody(request);if(!allowedEvents.has(data.event_name)||typeof data.session_id!=='string'||!/^[0-9a-f-]{36}$/i.test(data.session_id))return json({error:'이벤트 형식이 올바르지 않습니다.'},400);
        const payload={};for(const k of ['asset_id','utility_id','destination','step','mode','asset_count'])if(['string','number','boolean'].includes(typeof data[k]))payload[k]=String(data[k]).slice(0,160);
        await recordEvent({session_id:data.session_id,event_name:data.event_name,payload,created_at:new Date().toISOString()});return json({stored:true},201);
      }
      return json({error:'지원하지 않는 API 경로 또는 메서드입니다.'},404);
    }catch(error){
      return json({error:error instanceof ProviderError||error.status?error.message:'요청 처리 중 오류가 발생했습니다. 다시 시도하세요.',code:error instanceof ProviderError?error.code:'REQUEST_FAILED'},error.status||500);
    }
  };
}
