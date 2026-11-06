import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.join(root,'.local','qa');await mkdir(out,{recursive:true});
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9334',`--user-data-dir=${path.join(out,'browser-profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;let id=0;const waiting=new Map();const errors=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let target;
  for(let i=0;i<40;i++){try{const targets=await fetch('http://127.0.0.1:9334/json').then(r=>r.json());target=targets.find(t=>t.type==='page');if(target)break;}catch{}await pause(250);}
  assert.ok(target,'Chrome debugging target available');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.id){const p=waiting.get(data.id);waiting.delete(data.id);if(data.error)p?.reject(new Error(data.error.message));else p?.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text+': '+(data.params.exceptionDetails.exception?.description||''));};
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;waiting.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1150,deviceScaleFactor:1,mobile:false});

  const seed=()=>{
    const address=n=>'0x'+String(n).repeat(40),now=new Date().toISOString();
    const wallets=[{address:address(1),label:'Main wallet',last_synced_at:now},{address:address(2),label:'Missing price',last_synced_at:now},{address:address(3),label:'Not queried'},{address:address(4),label:'Empty wallet',last_synced_at:now}];
    const contract='0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
    const assets=[1,2,3].map(n=>({id:contract+':'+n,token_id:String(n),contract,collection:'BAYC',chain:'ethereum',asset_type:'AVATAR',owner_wallet:n<3?address(1):address(2),traits:[],image:'',demo:false,last_synced_at:now}));
    for(const [key,value] of Object.entries({wallets,assets,mode:'live',lastSynced:now}))sessionStorage.setItem('ob-'+key,JSON.stringify(value));
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});
    const original=window.fetch;
    window.fetch=async(input,init)=>{
      if(String(input).includes('/api/v1/assets/prices')){
        await new Promise(resolve=>setTimeout(resolve,1200));
        const requested=JSON.parse(init.body).assets;
        return Response.json({prices:requested.map(a=>({id:a.contract+':'+a.token_id,market_price:{quote_schema:3,kind:a.token_id==='3'?'NO_PORTFOLIO_VALUE':a.token_id==='2'?'PORTFOLIO_VALUE':'LISTING',currency:'ETH',value_eth:a.token_id==='3'?null:a.token_id==='2'?'2.2':'1.1',quoted_at:new Date().toISOString()}}))});
      }
      return original(input,init);
    };
    location.hash='wallets';
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'('+seed.toString()+')()'});
  await cdp('Page.navigate',{url:'http://localhost:3000'});await pause(1800);await evaluate('document.fonts.ready.then(()=>true)');
  for(let i=0;i<30;i++){if(await evaluate('document.querySelector("[data-wallet-eth]")?.textContent==="3.3"'))break;await pause(200);}
  const values=await evaluate('[...document.querySelectorAll(".wallet-row")].map(r=>({count:r.querySelector("[data-wallet-nft-count]").textContent,eth:r.querySelector("[data-wallet-eth]").textContent,note:r.querySelector(".wallet-metrics-note").textContent}))');
  if(values[0]?.eth!=='3.3')console.log(JSON.stringify({values,errors,assets:await evaluate('JSON.parse(sessionStorage.getItem("ob-assets"))')}));
  assert.deepEqual(values.map(v=>[v.count,v.eth]),[['2','3.3'],['1','—'],['—','—'],['0','0']]);
  assert.ok(values[1].note.includes('미확인 1개'));assert.ok(values[2].note.includes('조회 필요'));
  assert.equal(await evaluate('document.querySelectorAll(".wallet-actions [data-copy]").length'),0);
  await click('.wallet-copy');assert.equal(await evaluate('window.__copied'),'0x'+'1'.repeat(40));
  const capture=async name=>{const image=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,name),Buffer.from(image.data,'base64'));};
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await capture('wallet-metrics-desktop.png');
  for(const width of [900,390]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await pause(200);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await capture('wallet-metrics-'+width+'.png');}
  await click('[data-remove-wallet]');assert.equal(await evaluate('document.querySelectorAll(".wallet-row").length'),3);
  assert.equal(await evaluate('document.querySelector("[data-wallet-eth]").textContent'),'—');
  assert.deepEqual(errors,[]);console.log('PASS: per-wallet counts, exact streamed ETH totals, unknown vs empty holdings, unavailable prices, adjacent clipboard action, delete, desktop/tablet/mobile without overflow.');
}finally{socket?.close();browser.kill();}
