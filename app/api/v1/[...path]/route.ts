import {env} from 'cloudflare:workers';
import registry from '../../../../public/registry.json';
import {createBridgeApi} from '../../../../lib/bridge-api.js';
import {d1Cache} from '../../../../lib/d1-cache';

export const dynamic='force-dynamic';
async function handle(request:Request){
  if(!env.DB)return Response.json({error:'서버 데이터베이스를 준비 중입니다. 잠시 후 다시 시도하세요.'},{status:503});
  const api=createBridgeApi({registry,cache:d1Cache(env.DB),alchemyKey:env.ALCHEMY_API_KEY,openseaKey:env.OPENSEA_API_KEY,recordEvent:async(event:any)=>{
    await env.DB!.prepare('INSERT INTO bridge_events(session_id,event_name,payload,created_at) VALUES(?,?,?,?)').bind(event.session_id,event.event_name,JSON.stringify(event.payload),event.created_at).run();
  }});
  return api(request);
}
export {handle as GET,handle as POST};
