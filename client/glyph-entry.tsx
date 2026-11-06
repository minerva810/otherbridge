import React,{useState,useEffect,useMemo,useRef,Component} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {GlyphWalletProvider,GlyphWidget,useGlyph,useGlyphView,useNativeGlyphConnection,useGlyphOwnershipCheck,GlyphView} from '@use-glyph/sdk-react';
import {useAccount} from 'wagmi';
import '@use-glyph/sdk-react/style.css';
import {evaluateOnboarding} from '../public/onboarding-state.js';
import {LinkedWalletCards} from './linked-wallet-cards.js';

type Context={wallets:any[],assets:any[],collections:any[]};
let context:Context={wallets:[],assets:[],collections:[]};
let mounted=false;
let appRoot:ReturnType<typeof createRoot>|null=null;
let controls:any=null;
let externalStatus:any={ready:false,signedIn:false,checking:false,rows:[],asset_count:0,ready_assets:0,canContinue:false};
const shorten=(value:string)=>value.slice(0,6)+'…'+value.slice(-4);
function notify(status:any){externalStatus=status;window.dispatchEvent(new CustomEvent('otherbridge:glyph-status',{detail:status}));}
function record(event:string,detail:any={}){window.dispatchEvent(new CustomEvent('otherbridge:glyph-event',{detail:{event,...detail}}));}
export function setContext(value:Context){
  const key=(c:Context)=>JSON.stringify({wallets:c.wallets.map(w=>[w.address,w.demo,w.last_synced_at]),assets:c.assets.map(a=>[a.id,a.owner_wallet,a.contract,a.token_id,a.demo]),collections:c.collections.map(c=>[c.id,c.contract])});
  if(key(value)!==key(context)){context=value;window.dispatchEvent(new Event('otherbridge:glyph-context'));}
}
export function getStatus(){return externalStatus;}
export function act(action:string){if(controls?.[action])return controls[action]();throw new Error('Glyph가 준비 중입니다. 잠시 후 다시 시도하세요.');}
class GlyphBoundary extends Component<any,{error:boolean}>{
  state={error:false};
  static getDerivedStateFromError(){return {error:true};}
  componentDidCatch(){notify({...externalStatus,ready:false,signedIn:false,error:'Glyph를 초기화하지 못했습니다. 새로고침하거나 잠시 후 다시 시도하세요.'});}
  render(){return this.state.error?null:this.props.children;}
}
function GlyphController(){
  const glyph=useGlyph();const {connect}=useNativeGlyphConnection();const {isConnected,isConnecting}=useAccount();
  const {setGlyphView}=useGlyphView();const {checkOwnership}=useGlyphOwnershipCheck();
  const [current,setCurrent]=useState(context);const [checks,setChecks]=useState<Record<string,any>>({});
  const [checking,setChecking]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [checkedAt,setCheckedAt]=useState<string|null>(null);
  const [verifiedFor,setVerifiedFor]=useState('');
  const [targets,setTargets]=useState(()=>({auth:document.getElementById('glyph-auth-slot'),page:document.getElementById('glyph-onboarding-slot')}));
  const generation=useRef(0);const inFlight=useRef(false);const authenticatedRef=useRef(false);const userKey=useRef('');const checkRef=useRef(checkOwnership);checkRef.current=checkOwnership;
  authenticatedRef.current=Boolean(glyph.ready&&glyph.authenticated);
  const identity=glyph.ready&&glyph.authenticated?`${glyph.user?.id||''}:${glyph.user?.evmWallet||''}`:'';
  const assetScope=JSON.stringify(current.assets.filter(a=>!a.demo).map(a=>[a.id,a.owner_wallet,a.contract]).sort());
  const scope=identity+'|'+assetScope;
  async function refresh(){
    if(!authenticatedRef.current||inFlight.current)return;
    inFlight.current=true;const epoch=++generation.current;setChecking(true);setError('');setChecks({});setVerifiedFor('');
    try{
      await glyph.refreshUser(true);
      if(epoch!==generation.current||!authenticatedRef.current)return;
      const ids=new Set(context.assets.filter(a=>!a.demo).map(a=>a.collection));
      const selected=context.collections.filter(c=>ids.has(c.id));const next:Record<string,any>={};
      // Explicit Ethereum chain; do not infer delegation from a different network.
      for(const collection of selected){
        if(epoch!==generation.current||!authenticatedRef.current)return;
        try{
          const result=await checkRef.current({contractAddress:collection.contract,chainId:1,includeDelegates:true,quantity:1});
          next[collection.id]=result.error?{status:'error',error:'Glyph에서 해당 컬렉션 상태를 확인하지 못했습니다.'}:{status:'success',subject:glyph.user?.evmWallet,chainId:1,contractAddress:collection.contract,tokens:result.tokens||[],delegationChain:result.delegationChain||[]};
        }catch{next[collection.id]={status:'error',error:'연결 상태 조회에 실패했습니다. 다시 확인하세요.'};}
      }
      if(epoch===generation.current&&authenticatedRef.current){setChecks(next);setVerifiedFor(scope);setCheckedAt(new Date().toISOString());record('glyph_status_checked',{collection_count:selected.length});}
    }catch{if(epoch===generation.current)setError('Glyph 상태를 갱신하지 못했습니다. 로그인 상태와 네트워크를 확인하세요.');}
    finally{if(epoch===generation.current){inFlight.current=false;setChecking(false);}}
  }
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  useEffect(()=>{
    const change=()=>setCurrent(context);
    const redraw=()=>setTargets(previous=>{const next={auth:document.getElementById('glyph-auth-slot'),page:document.getElementById('glyph-onboarding-slot')};return previous.auth===next.auth&&previous.page===next.page?previous:next;});
    window.addEventListener('otherbridge:glyph-context',change);window.addEventListener('otherbridge:render',redraw);
    return()=>{window.removeEventListener('otherbridge:glyph-context',change);window.removeEventListener('otherbridge:render',redraw);};
  },[]);
  useEffect(()=>{
    generation.current++;inFlight.current=false;setChecking(false);setChecks({});setCheckedAt(null);setError('');
    if(identity){if(userKey.current!==identity)record('glyph_login_completed');userKey.current=identity;void refreshRef.current();}else{userKey.current='';}
  },[identity,assetScope]);
  useEffect(()=>{
    let last=0;const resume=()=>{if(document.visibilityState==='visible'&&Date.now()-last>3000){last=Date.now();void refreshRef.current();}};
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const status=useMemo(()=>({...evaluateOnboarding({ready:glyph.ready,authenticated:glyph.authenticated,user:glyph.user,wallets:current.wallets,assets:current.assets,ownershipChecks:verifiedFor===scope?checks:{},checking}),checkedAt:verifiedFor===scope?checkedAt:null,error,user:glyph.authenticated?{id:glyph.user?.id,evmWallet:glyph.user?.evmWallet,linkedWallets:glyph.user?.linkedWallets}:null}),[glyph.ready,glyph.authenticated,glyph.user,current,checks,checking,checkedAt,error,scope,verifiedFor]);
  useEffect(()=>notify(status),[status]);
  async function login(){setError('');setBusy(true);try{if(!isConnected){await connect();}else{const success=await glyph.signIn();if(!success)setError('Glyph 인증을 완료하지 못했습니다. 팝업을 허용하고 인증을 다시 시도하세요.');}}catch{setError('Glyph 로그인이 취소되었거나 연결하지 못했습니다. 팝업을 허용하고 다시 시도하세요.');}finally{setBusy(false);}}
  function logout(){generation.current++;inFlight.current=false;setChecks({});setCheckedAt(null);glyph.logout();record('glyph_logout');}
  function portal(reason='portal'){
    const url=new URL('/',glyph.glyphUrl);if(url.protocol!=='https:')throw new Error('Glyph portal unavailable');
    window.open(url.href,'_blank','noopener,noreferrer');record(reason==='delegation'?'glyph_delegation_started':'glyph_signup_started');
  }
  function linkWallet(){setGlyphView(GlyphView.LINKED_ACCOUNTS);record('glyph_wallet_link_started');}
  controls={login,signup:()=>portal(),logout,refresh:()=>refreshRef.current(),link:linkWallet,delegate:()=>portal('delegation')};
  const signedIn=status.signedIn;const disabled=busy||isConnecting||(isConnected&&!glyph.ready);
  const loginText=isConnecting||busy?'Glyph 연결 중…':isConnected&&!signedIn?'Glyph 인증 계속하기':'Log in with Glyph';
  return <>
    {targets.auth&&createPortal(<div className="glyph-auth-actions">{signedIn?<><span className="glyph-account-chip"><span className="live-dot"/>Glyph · {shorten(glyph.user!.evmWallet)}</span><button className="glyph-text-button" onClick={logout}>Log out</button></>:<><button className="glyph-login-button" onClick={login} disabled={disabled}>{loginText}</button><button className="glyph-signup-button" onClick={()=>portal()} disabled={!glyph.glyphUrl}>Sign up</button></>}</div>,targets.auth)}
    {targets.page&&createPortal(<div className="glyph-onboarding">
      <section className="glyph-intro-card"><div><span className="eyebrow">STATEFUL ONBOARDING</span><h2>{signedIn?'Your wallets. Your next step.':'Your Glyph. Your way in.'}</h2><p>{signedIn?'현재 Glyph 계정에 각 지갑이 연결되어 있는지 확인하세요.':'Glyph로 로그인하면 지갑별 연결 여부를 확인할 수 있습니다.'}</p></div><span className={'glyph-auth-state '+(signedIn?'verified':'')}>{signedIn?'✓ Glyph authenticated':glyph.ready?'Glyph sign-in required':'Glyph 준비 중'}</span></section>
      {error&&<div className="inline-message error" role="alert">{error}</div>}
      {!signedIn?<section className="glyph-login-card"><div className="glyph-step-number">01</div><div><h3>Log in / sign up with Glyph</h3><p>기존 계정으로 로그인하거나 새 Glyph 계정을 만드세요. 로그인 과정에서 Glyph 공식 인증 메시지 서명이 요청될 수 있습니다.</p><div className="glyph-action-row"><button className="btn btn-primary" onClick={login} disabled={disabled}>{loginText} ↗</button><button className="btn btn-outline" onClick={()=>portal()} disabled={!glyph.glyphUrl}>Sign up with Glyph ↗</button></div>{isConnected&&<p className="glyph-signature-note">지갑 연결은 완료되었습니다. ‘Glyph 인증 계속하기’를 눌러 공식 인증을 마무리하세요.</p>}</div></section>:<>
        <div className="glyph-status-toolbar"><span>{checking?'Glyph에서 상태 확인 중…':checkedAt?`마지막 확인 ${new Date(checkedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · Ethereum`:'Ethereum · 현재 계정 기준'}</span><div><button className="btn btn-primary" onClick={()=>refresh()} disabled={checking}>{checking?'확인 중…':'상태 다시 확인'} ↻</button></div></div>
        <LinkedWalletCards rows={status.rows} onLink={linkWallet}/>
        <div className="glyph-linked-footer"><span>연결 상태만 표시합니다. NFT 이용 조건은 Otherside 공식 서비스에서 확인하세요.</span><a className="btn btn-outline" href="https://www.otherside.xyz/" target="_blank" rel="noopener noreferrer" onClick={()=>{record('official_link_clicked',{destination:'otherside'});record('otherside_link_clicked');}}>Otherside 공식 사이트 ↗</a></div>
      </>}
      <div className="glyph-readonly-note">지갑 연결은 Glyph 공식 화면에서 진행합니다. 계정 연결 여부가 최종 NFT 이용 자격을 뜻하지 않습니다. <a href="https://docs.useglyph.io/getting-started/" target="_blank" rel="noopener noreferrer">공식 문서 ↗</a></div>
    </div>,targets.page)}
    <div className="glyph-official-widget"><GlyphWidget buttonProps={{hide:true}}/></div>
  </>;
}
export function mount(){
  if(mounted)return;mounted=true;
  const node=document.createElement('div');node.id='glyph-sdk-root';document.body.append(node);
  appRoot=createRoot(node);appRoot.render(<GlyphBoundary><GlyphWalletProvider askForSignature={false}><GlyphController/></GlyphWalletProvider></GlyphBoundary>);
}
export function restart(){appRoot?.unmount();document.getElementById('glyph-sdk-root')?.remove();mounted=false;controls=null;notify({ready:false,signedIn:false,checking:false,rows:[],asset_count:0,ready_assets:0,canContinue:false});mount();}
