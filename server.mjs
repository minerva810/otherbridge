import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createBridgeApi} from './lib/bridge-api.js';

const root=fileURLToPath(new URL('.',import.meta.url));const publicDir=path.join(root,'public');
for(const file of [path.join(root,'..','.env'),path.join(root,'.env')])if(existsSync(file))process.loadEnvFile(file);
await mkdir(path.join(root,'.local'),{recursive:true});
const db=new DatabaseSync(path.join(root,'.local','other-bridge.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS wallet_cache(address TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metadata_cache(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_events(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,event_name TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);`);
const registry=JSON.parse(await readFile(path.join(publicDir,'registry.json'),'utf8'));
const cache={
  async getWallet(address){const r=db.prepare('SELECT payload FROM wallet_cache WHERE address=?').get(address);return r?JSON.parse(r.payload):null;},
  async setWallet(address,data){db.prepare('INSERT OR REPLACE INTO wallet_cache(address,payload,updated_at) VALUES(?,?,?)').run(address,JSON.stringify(data),new Date().toISOString());},
  async getMetadata(id){const r=db.prepare('SELECT payload FROM metadata_cache WHERE id=?').get(id);return r?JSON.parse(r.payload):null;},
  async setMetadata(id,data){db.prepare('INSERT OR REPLACE INTO metadata_cache(id,payload,updated_at) VALUES(?,?,?)').run(id,JSON.stringify(data),new Date().toISOString());},
};
const api=createBridgeApi({registry,cache,alchemyKey:process.env.ALCHEMY_API_KEY,openseaKey:process.env.OPENSEA_API_KEY,recordEvent:async e=>db.prepare('INSERT INTO bridge_events(session_id,event_name,payload,created_at) VALUES(?,?,?,?)').run(e.session_id,e.event_name,JSON.stringify(e.payload),e.created_at)});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const requests=new Map();
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      const ip=req.socket.remoteAddress;const now=Date.now();const previous=requests.get(ip);const window=previous&&now-previous.start<60000?previous:{start:now,count:0};requests.set(ip,window);
      if(++window.count>100){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'요청이 많습니다. 잠시 후 다시 시도하세요.'}));return;}
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);const file=path.resolve(publicDir,requested);
    if(!file.startsWith(publicDir+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
    const contents=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:contents);
  }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'요청 처리 중 오류가 발생했습니다.'}));}
});
const port=Number(process.env.PORT)||3000;
server.listen(port,'127.0.0.1',()=>console.log(`Other Bridge ready at http://localhost:${port}\nAlchemy configured: ${Boolean(process.env.ALCHEMY_API_KEY)}\nOpenSea configured: ${Boolean(process.env.OPENSEA_API_KEY)}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
