import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {normalizeWallets, normalizeNft, dedupeAssets, matchUtility} from './dist/core.js';

const root=fileURLToPath(new URL('.',import.meta.url));
const dist=path.join(root,'dist');
await mkdir(path.join(root,'.local'),{recursive:true});
const db=new DatabaseSync(path.join(root,'.local','other-bridge.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, auth_provider TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS wallets(address TEXT PRIMARY KEY, last_synced_at TEXT, asset_count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, owner_wallet TEXT NOT NULL, collection_id TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS assets_by_wallet ON assets(owner_wallet);
CREATE TABLE IF NOT EXISTS utilities(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS utility_rules(utility_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS utility_guides(id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, event_name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);`);
const seed=JSON.parse(await readFile(path.join(dist,'registry.json'),'utf8'));
for(const c of seed.collections)db.prepare('INSERT OR IGNORE INTO collections(id,data) VALUES(?,?)').run(c.id,JSON.stringify(c));
for(const u of seed.utilities){db.prepare('INSERT OR IGNORE INTO utilities(id,data) VALUES(?,?)').run(u.id,JSON.stringify(u));db.prepare('INSERT OR IGNORE INTO utility_rules(utility_id,data) VALUES(?,?)').run(u.id,JSON.stringify(u.requirements));}
for(let i=0;i<seed.guides.length;i++)db.prepare('INSERT OR IGNORE INTO utility_guides(id,data) VALUES(?,?)').run(i,JSON.stringify(seed.guides[i]));
function registry(){return {reviewed_at:seed.reviewed_at,collections:db.prepare('SELECT data FROM collections ORDER BY rowid').all().map(r=>JSON.parse(r.data)),utilities:db.prepare('SELECT utilities.data, utility_rules.data AS rules FROM utilities LEFT JOIN utility_rules ON utility_rules.utility_id=utilities.id ORDER BY utilities.rowid').all().map(r=>({...JSON.parse(r.data),requirements:r.rules?JSON.parse(r.rules):[]})),guides:db.prepare('SELECT data FROM utility_guides ORDER BY id').all().map(r=>JSON.parse(r.data))};}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>64000)throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}try{return JSON.parse(text);}catch{throw Object.assign(new Error('올바른 JSON 요청이 필요합니다.'),{status:400});}}
function cacheFor(address){const w=db.prepare('SELECT * FROM wallets WHERE address=?').get(address);return w?{assets:db.prepare('SELECT data FROM assets WHERE owner_wallet=?').all(address).map(r=>JSON.parse(r.data)),last_synced_at:w.last_synced_at}:null;}
async function fetchWallet(address,collections){
  const cached=cacheFor(address);if(cached&&Date.now()-Date.parse(cached.last_synced_at)<10*60*1000)return {...cached,cached:true};
  if(!process.env.ALCHEMY_API_KEY)throw Object.assign(new Error('실제 NFT 조회를 위해 서버의 ALCHEMY_API_KEY 환경변수를 설정하세요. 샘플 체험은 키 없이 이용할 수 있습니다.'),{status:503});
  const assets=[];let pageKey;let page=0;const seen=new Set();
  do{
    const url=new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${encodeURIComponent(process.env.ALCHEMY_API_KEY)}/getNFTsForOwner`);
    url.searchParams.set('owner',address);url.searchParams.set('withMetadata','true');url.searchParams.set('pageSize','100');
    for(const c of collections)url.searchParams.append('contractAddresses[]',c.contract);
    if(pageKey)url.searchParams.set('pageKey',pageKey);
    let response;
    try{response=await fetch(url,{signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(new Error('NFT 조회 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'),{status:502});}
    if(!response.ok)throw Object.assign(new Error(response.status===429?'NFT API 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.':'NFT 조회 서비스에서 오류가 발생했습니다.'),{status:502});
    const data=await response.json();if(!Array.isArray(data.ownedNfts))throw Object.assign(new Error('NFT 서비스 응답 형식이 올바르지 않습니다.'),{status:502});
    assets.push(...data.ownedNfts.map(nft=>normalizeNft(nft,address,collections)).filter(Boolean));
    pageKey=data.pageKey;
    if(pageKey&&seen.has(pageKey))throw Object.assign(new Error('NFT 페이지 조회가 반복되었습니다. 다시 시도하세요.'),{status:502});
    if(pageKey)seen.add(pageKey);
    if(++page>=100&&pageKey)throw Object.assign(new Error('한 지갑의 조회 범위를 초과했습니다. 조회가 완결되지 않아 저장하지 않았습니다.'),{status:422});
  }while(pageKey);
  const synced=new Date().toISOString();
  db.exec('BEGIN');try{db.prepare('DELETE FROM assets WHERE owner_wallet=?').run(address);const insert=db.prepare('INSERT OR REPLACE INTO assets(id,owner_wallet,collection_id,data) VALUES(?,?,?,?)');for(const a of dedupeAssets(assets))insert.run(a.id,address,a.collection,JSON.stringify(a));db.prepare('INSERT OR REPLACE INTO wallets(address,last_synced_at,asset_count) VALUES(?,?,?)').run(address,synced,assets.length);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return {assets:dedupeAssets(assets),last_synced_at:synced,cached:false};
}
const allowedEvents=new Set(['wallet_added','portfolio_loaded','asset_clicked','utility_viewed','utility_action_clicked','guide_started','guide_step_completed','official_link_clicked','glyph_link_clicked','otherside_link_clicked']);
const limits=new Map();
function rateLimit(req){const id=req.socket.remoteAddress;const now=Date.now();let window=limits.get(id);if(!window||now-window.start>60000){window={start:now,count:0};limits.set(id,window);}if(++window.count>100)throw Object.assign(new Error('요청이 많습니다. 잠시 후 다시 시도하세요.'),{status:429});if(limits.size>1000)for(const [key,value]of limits)if(now-value.start>60000)limits.delete(key);}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))rateLimit(req);
    if(url.pathname==='/api/v1/health'&&req.method==='GET')return send(res,200,{service:'other-bridge',alchemy_configured:Boolean(process.env.ALCHEMY_API_KEY),read_only:true});
    if(url.pathname==='/api/v1/portfolio/resolve'&&req.method==='POST'){
      const input=await body(req);let wallets;try{wallets=normalizeWallets(input.wallets);}catch(e){return send(res,400,{error:e.message});}
      const r=registry();const results=[];let stale=false;
      // Bound upstream concurrency and retain a coherent result for every requested address.
      for(let i=0;i<wallets.length;i+=4){
        const batch=await Promise.all(wallets.slice(i,i+4).map(async address=>{
          try{return await fetchWallet(address,r.collections);}catch(e){const cached=cacheFor(address);if(cached&&Date.now()-Date.parse(cached.last_synced_at)<24*60*60*1000){stale=true;return cached;}throw e;}
        }));results.push(...batch);
      }
      const assets=dedupeAssets(results.flatMap(r=>r.assets));
      return send(res,200,{wallet_count:wallets.length,asset_count:assets.length,assets,collections:Object.fromEntries(r.collections.map(c=>[c.id,assets.filter(a=>a.collection===c.id).length])),last_synced_at:results.map(r=>r.last_synced_at).sort()[0],stale,warning:stale?'외부 NFT API 오류로 최근 24시간 이내 캐시를 표시합니다. 소유 정보가 변경되었을 수 있습니다.':null});
    }
    if(url.pathname==='/api/v1/utilities/match'&&req.method==='POST'){
      const input=await body(req);if(!Array.isArray(input.assets)||input.assets.length>10000)return send(res,400,{error:'자산 목록이 필요합니다.'});
      if(input.assets.some(a=>!a||typeof a!=='object'||typeof a.collection!=='string'||a.traits!=null&&!Array.isArray(a.traits)))return send(res,400,{error:'자산 형식이 올바르지 않습니다.'});
      return send(res,200,{matches:registry().utilities.map(u=>({utility:u,...matchUtility(u,input.assets)})).sort((a,b)=>(b.utility.status==='LIVE')-(a.utility.status==='LIVE'))});
    }
    if(url.pathname.startsWith('/api/v1/utilities/')&&req.method==='GET'){
      const u=registry().utilities.find(u=>u.id===decodeURIComponent(url.pathname.slice('/api/v1/utilities/'.length)));return send(res,u?200:404,u||{error:'유틸리티를 찾을 수 없습니다.'});
    }
    if(url.pathname.startsWith('/api/v1/assets/')&&req.method==='GET'){
      const id=decodeURIComponent(url.pathname.slice('/api/v1/assets/'.length));const found=db.prepare('SELECT data FROM assets WHERE id=?').get(id);if(!found)return send(res,404,{error:'조회한 자산을 찾을 수 없습니다.'});
      const asset=JSON.parse(found.data);return send(res,200,{asset,utilities:registry().utilities.filter(u=>u.collections.includes(asset.collection)).map(u=>({...u,match:matchUtility(u,[asset])}))});
    }
    if(url.pathname==='/api/v1/events'&&req.method==='POST'){
      const input=await body(req);if(!allowedEvents.has(input.event_name)||typeof input.session_id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.session_id))return send(res,400,{error:'이벤트 형식이 올바르지 않습니다.'});
      const clean={};for(const key of ['asset_id','utility_id','destination','step','mode','asset_count'])if(['string','number','boolean'].includes(typeof input[key]))clean[key]=String(input[key]).slice(0,160);
      db.prepare('INSERT INTO events(session_id,event_name,data,created_at) VALUES(?,?,?,?)').run(input.session_id,input.event_name,JSON.stringify(clean),new Date().toISOString());return send(res,201,{stored:true});
    }
    if(url.pathname.startsWith('/api/'))return send(res,404,{error:'지원하지 않는 API 경로입니다.'});
    if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'허용되지 않은 메서드입니다.'});
    if(url.pathname==='/registry.json')return send(res,200,registry());
    const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    const file=path.resolve(dist,requested);
    if(!file.startsWith(dist+path.sep))return send(res,403,{error:'접근할 수 없는 경로입니다.'});
    if(!existsSync(file))return send(res,404,{error:'파일을 찾을 수 없습니다.'});
    const contents=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:contents);
  }catch(error){send(res,error.status||500,{error:error.status?error.message:'요청 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'});}
});
const port=Number(process.env.PORT)||3000;
server.listen(port,'127.0.0.1',()=>console.log(`Other Bridge is ready at http://localhost:${port}\nAlchemy: ${process.env.ALCHEMY_API_KEY?'configured':'not configured — demo available'}\nDatabase: .local/other-bridge.sqlite`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
