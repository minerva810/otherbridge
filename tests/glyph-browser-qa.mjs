import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.local/glyph-qa');await mkdir(out,{recursive:true});
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9336',`--user-data-dir=${path.join(out,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;let next=0;const pending=new Map();const errors=[];
try{
 let target;for(let i=0;i<60;i++){try{target=(await fetch('http://127.0.0.1:9336/json').then(r=>r.json())).find(t=>t.type==='page');if(target)break;}catch{}await pause(200);}assert.ok(target);
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p?.reject(new Error(data.error.message)):p?.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
 const screenshot=async file=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,file),Buffer.from(shot.data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://localhost:3000/#onboarding'});
 for(let i=0;i<200;i++){if(await evaluate('Boolean(document.querySelector(".glyph-login-card"))'))break;await pause(200);}assert.ok(await evaluate('Boolean(document.querySelector(".glyph-login-card"))'));
 assert.equal(await evaluate('location.hash'),'#activity');
 assert.equal(await evaluate('document.querySelector(".glyph-login-card .btn-primary").disabled'),false);
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".glyph-loading-card")).display'),'none');
 assert.equal(await evaluate('getComputedStyle(document.querySelector("#glyph-auth-slot>[data-glyph-open]")).display'),'none');
 assert.equal(await evaluate('import("/glyph/glyph.js").then(module=>module.getStatus().signedIn)'),false);
 await evaluate('document.fonts.ready.then(()=>true)');await screenshot('desktop.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(200);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await screenshot('mobile.png');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 async function popup(selector,label){
   await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);let popup;
   for(let i=0;i<60;i++){const targets=await send('Target.getTargets');popup=targets.targetInfos.find(t=>t.type==='page'&&t.targetId!==target.id&&/^https:\/\//.test(t.url));if(popup)break;await pause(200);}
   assert.ok(popup,label+' popup opened');console.log(JSON.stringify({check:label,origin:new URL(popup.url).origin}));await send('Target.closeTarget',{targetId:popup.targetId});await pause(400);
 }
 await popup('.glyph-signup-button','official Glyph signup');
 await popup('.glyph-login-card .btn-primary','official Glyph login');
 assert.equal(await evaluate('import("/glyph/glyph.js").then(module=>module.getStatus().signedIn)'),false);
 await evaluate('location.hash="wallets"');await pause(200);await evaluate('location.hash="activity"');await pause(200);assert.ok(await evaluate('Boolean(document.querySelector(".glyph-login-card"))'));
 assert.equal(await evaluate('document.querySelectorAll("[data-complete-step]").length'),0);assert.deepEqual(errors,[]);
 console.log('PASS: Glyph SDK initialization, guest state, desktop/mobile layout, signup/login popup entry, popup cancellation and SPA remount. No account credentials entered or signatures submitted.');
}finally{socket?.close();browser.kill();}
