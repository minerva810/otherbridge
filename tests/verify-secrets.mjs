import {existsSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
for(const file of ['../.env','.env'])if(existsSync(file))process.loadEnvFile(file);
const secrets=['ALCHEMY_API_KEY','OPENSEA_API_KEY'].map(k=>process.env[k]).filter(Boolean);
let count=0;
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else{const contents=await readFile(file);count++;if(secrets.some(value=>contents.includes(Buffer.from(value))))throw new Error('Secret found in distributable files.');}}}
await scan('public');await scan('dist');
console.log(`PASS: ${count} public and built files checked; no provider key values embedded.`);
