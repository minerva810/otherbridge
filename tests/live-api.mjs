import {existsSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openseaMetadata,alchemyOwnership,openseaOwnership} from '../lib/nft-providers.js';
for(const file of ['../.env','.env'])if(existsSync(file))process.loadEnvFile(file);
const registry=JSON.parse(await readFile(new URL('../public/registry.json',import.meta.url)));
const options={alchemyKey:process.env.ALCHEMY_API_KEY,openseaKey:process.env.OPENSEA_API_KEY};
if(!options.alchemyKey||!options.openseaKey)throw new Error('Both provider API keys must be configured server-side.');
const contract=registry.collections[0].contract;
try{
  const metadata=await openseaMetadata(contract,'1',options);assert.ok(metadata.image||metadata.traits.length);console.log(JSON.stringify({check:'OpenSea NFT metadata',ok:true,has_image:Boolean(metadata.image),traits:metadata.traits.length}));
  const url=new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${encodeURIComponent(options.alchemyKey)}/getOwnersForNFT`);url.searchParams.set('contractAddress',contract);url.searchParams.set('tokenId','1');
  let response;try{response=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch{throw new Error('Alchemy owner lookup network failure');}
  if(!response.ok)throw new Error(`Alchemy owner lookup HTTP ${response.status}`);
  const owners=await response.json();const owner=owners.owners?.[0];assert.match(owner,/^0x[0-9a-f]{40}$/i);
  const assets=await alchemyOwnership(owner,registry.collections,options);assert.ok(assets.some(a=>a.contract===contract&&a.token_id==='1'));console.log(JSON.stringify({check:'Alchemy live ownership and normalization',ok:true,supported_assets:assets.length,has_images:assets.filter(a=>a.image).length}));
  const secondary=await openseaOwnership(owner,registry.collections,options);assert.ok(secondary.some(a=>a.contract===contract&&a.token_id==='1'));console.log(JSON.stringify({check:'OpenSea live ownership fallback',ok:true,supported_assets:secondary.length}));
  await mkdir('.local',{recursive:true});await writeFile('.local/live-fixture.json',JSON.stringify({owner,asset_id:contract+':1',asset_count:assets.length}));
}catch(error){console.error(error.message.replaceAll(options.alchemyKey,'[redacted]').replaceAll(options.openseaKey,'[redacted]'));process.exitCode=1;}
