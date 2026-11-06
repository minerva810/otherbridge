import {EVM_ADDRESS} from './core.js';
const normalize=value=>typeof value==='string'&&EVM_ADDRESS.test(value.trim())?value.trim().toLowerCase():null;
export function mergeGlyphWallets(wallets,status,{limit=20}={}){
  const primary=normalize(status?.user?.evmWallet);
  if(!status?.ready||!status.signedIn||!primary)return {wallets,added:[],skipped:[],import_key:null};
  const user=status.user;
  const addresses=[...new Set([primary,normalize(user.smartWallet),...(Array.isArray(user.linkedWallets)?user.linkedWallets.map(w=>normalize(w?.address)):[])].filter(Boolean))];
  const existing=new Map();
  for(const wallet of wallets){const address=normalize(wallet?.address);if(!wallet?.demo&&address&&!existing.has(address))existing.set(address,{...wallet,address});}
  const added=[],skipped=[];
  for(const address of addresses){
    if(existing.has(address))continue;
    if(existing.size>=limit){skipped.push(address);continue;}
    const wallet={address,label:'Glyph account wallet',demo:false};existing.set(address,wallet);added.push(wallet);
  }
  return {wallets:[...existing.values()],added,skipped,account_addresses:addresses,import_key:primary+'|'+[...addresses].sort().join('|')};
}
