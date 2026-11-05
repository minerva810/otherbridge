const EVM=/^0x[0-9a-fA-F]{40}$/;
const address=value=>typeof value==='string'&&EVM.test(value)?value.toLowerCase():null;
const tokenId=value=>typeof value==='number'&&!Number.isSafeInteger(value)?null:/^\d+$/.test(String(value))?BigInt(value).toString():null;
/** @param {{ready?:boolean,authenticated?:boolean,user?:{evmWallet?:string,smartWallet?:string,linkedWallets?:Array<{address:string}>}|null,wallets?:Array<{address:string,demo?:boolean,last_synced_at?:string}>,assets?:Array<any>,ownershipChecks?:Record<string,any>,checking?:boolean}} [input] */
export function evaluateOnboarding({ready=false,authenticated=false,user=null,wallets=[],assets=[],ownershipChecks={},checking=false}={}){
  const signedIn=Boolean(ready&&authenticated&&address(user?.evmWallet));
  const primary=signedIn?address(user.evmWallet):null;
  const ownWallets=new Set(signedIn?[primary,address(user.smartWallet)].filter(Boolean):[]);
  const links=signedIn&&Array.isArray(user?.linkedWallets)?new Set(user.linkedWallets.map(w=>address(w?.address)).filter(Boolean)):null;
  const realAssets=assets.filter(a=>a&&!a.demo&&address(a.owner_wallet)&&address(a.contract)&&tokenId(a.token_id)!==null);
  const owners=new Set([...wallets.filter(w=>!w.demo).map(w=>address(w.address)),...realAssets.map(a=>address(a.owner_wallet))].filter(Boolean));
  ownWallets.forEach(a=>owners.add(a));if(links)links.forEach(a=>owners.add(a));
  const rows=[...owners].map(owner=>{
    const owned=realAssets.filter(a=>address(a.owner_wallet)===owner);
    const queried=wallets.some(wallet=>address(wallet.address)===owner&&Boolean(wallet.last_synced_at));
    let linked=!signedIn?'UNKNOWN':ownWallets.has(owner)||links?.has(owner)?'LINKED':links?'NOT_LINKED':'UNKNOWN';
    const nftStates=owned.map(asset=>{
      const check=ownershipChecks[asset.collection];const id=tokenId(asset.token_id);const contract=address(asset.contract);
      const validCheck=signedIn&&check?.status==='success'&&address(check.subject)===primary&&check.chainId===1&&address(check.contractAddress)===contract;
      const tokens=validCheck&&Array.isArray(check.tokens)?check.tokens:[];
      const token=tokens.find(t=>address(t.owner)===owner&&tokenId(t.id)===id);
      const evidence=validCheck&&Array.isArray(check.delegationChain)?check.delegationChain.filter(item=>address(item.account)===owner&&address(item.contractAddress)===contract&&Array.isArray(item.tokenIds)&&item.tokenIds.some(t=>tokenId(t)===id)):[];
      const tokenLinked=token?.linked===true||evidence.some(item=>item.linked===true);
      if(tokenLinked)linked='LINKED';
      const direct=signedIn&&ownWallets.has(owner);
      const detected=token?.delegated===true;
      // A successful ownership resolver can recognise linked NFTs without delegation.
      const recognised=Boolean(token&&token.delegated===false&&token.linked===true);
      const accessible=Boolean(direct||detected||recognised);
      const delegation=!signedIn?'UNKNOWN':direct||recognised?'NOT_REQUIRED':detected?'DETECTED':validCheck?'REQUIRED':'UNKNOWN';
      return {id:asset.id,collection:asset.collection,token_id:String(asset.token_id),owner_wallet:owner,linked:tokenLinked,delegation,accessible,source:validCheck?'GLYPH_OWNERSHIP_CHECK':direct?'GLYPH_PRIMARY_WALLET':null,error:check?.status==='error'?check.error:null};
    });
    const unresolved=nftStates.filter(a=>!a.accessible);
    const needsConnection=signedIn&&linked==='NOT_LINKED'&&(unresolved.length>0||!owned.length&&!queried);
    const needsDelegation=signedIn&&linked==='LINKED'&&unresolved.some(a=>a.delegation==='REQUIRED');
    const actions=!signedIn?[]:[...(needsConnection?['CONNECT']:[]),...(needsDelegation?['DELEGATE']:[]),...(!owned.length&&!queried?['LOAD_ASSETS']:[]),...(linked==='UNKNOWN'||unresolved.some(a=>a.delegation==='UNKNOWN')?['RECHECK']:[])];
    return {address:owner,linked,queried,nfts:nftStates,asset_count:owned.length,actions,ready:owned.length>0&&unresolved.length===0,delegation:nftStates.some(a=>a.delegation==='UNKNOWN')?'UNKNOWN':needsDelegation?'REQUIRED':nftStates.some(a=>a.delegation==='DETECTED')?'DETECTED':owned.length&&nftStates.every(a=>a.delegation==='NOT_REQUIRED')?'NOT_REQUIRED':'UNKNOWN'};
  });
  const relevant=rows.filter(r=>r.asset_count>0);
  return {ready,signedIn,checking,rows,asset_count:realAssets.length,ready_assets:rows.reduce((n,r)=>n+r.nfts.filter(a=>a.accessible).length,0),canContinue:signedIn&&!checking&&relevant.length>0&&relevant.every(r=>r.ready),missingCount:rows.reduce((n,r)=>n+r.actions.filter(a=>a!=='RECHECK').length,0)};
}
