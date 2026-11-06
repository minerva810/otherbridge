import {EVM_ADDRESS, matchUtility} from './core.js';
import {assetDetailLinks,renderAllTraits,currentAssetBenefits} from './asset-details.js';
import {summarizeWallet} from './wallet-summary.js';
import {mergeGlyphWallets} from './glyph-wallet-import.js';
import {pricePresentation,PRICE_REFRESH_MS,sumAssetValues,formatEth} from './prices.js';
import {SORT_OPTIONS,sortAssets,acquisitionTime} from './sorting.js';

const paths = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z"/>',
  route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8"/>',
  wallet:'<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6"/><path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z"/>',
  chart:'<path d="M4 3v17h17M8 15v-4m5 4V6m5 9v-7"/>',
  book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M9 3H4v17h17v-5"/>',
  refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  verified:'<path d="m12 2 3 2 3.5.5L20 8l2 4-2 4-1.5 3.5L15 20l-3 2-3-2-3.5-.5L4 16l-2-4 2-4 1.5-3.5L9 4Z"/><path d="m8 12 3 3 5-6"/>',
  game:'<path d="M7 7h10c4 0 6 12 3 13-2 1-4-4-5-4H9c-1 0-3 5-5 4C1 19 3 7 7 7Z"/><path d="M8 9v5m-2.5-2.5h5M16 10h.01M18 13h.01"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
  diamond:'<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  x:'<path d="m6 6 12 12M6 18 18 6"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = address => address.slice(0,6) + '…' + address.slice(-4);
const storage = {
  get(key, fallback) {try {return JSON.parse(sessionStorage.getItem('ob-' + key)) ?? fallback;} catch {return fallback;}},
  set(key, value) {try {sessionStorage.setItem('ob-' + key, JSON.stringify(value));} catch {}}
};
const registry = await fetch('/registry.json').then(r => {if(!r.ok) throw new Error('Registry unavailable');return r.json();}).catch(() => null);
if (!registry) {$('#main-content').innerHTML = '<div class="empty-state"><h3>유틸리티 정보를 불러오지 못했습니다.</h3><p>네트워크 상태를 확인하고 페이지를 새로고침해 주세요.</p></div>'; throw new Error('Registry unavailable');}
const demoWallets = [
  {address:'0x7a3d9e112bc891d48cbf9231d23ae6e7f22f4e81',label:'Explorer wallet',demo:true},
  {address:'0x8f21b690ee48d20dcb281263df35a7c30e7b93c4',label:'Collection wallet',demo:true}
];
const sampleAssets = [
  {collection:'BAYC',token_id:'8520',owner_wallet:demoWallets[0].address,traits:[{trait_type:'Fur',value:'Tan'},{trait_type:'Hat',value:'Fisherman’s hat'},{trait_type:'Clothes',value:'Black T-shirt'}]},
  {collection:'MAYC',token_id:'12843',owner_wallet:demoWallets[0].address,traits:[{trait_type:'Fur',value:'M1 Blue'},{trait_type:'Eyes',value:'Glowing'},{trait_type:'Background',value:'Purple'}]},
  {collection:'KODA',token_id:'7214',owner_wallet:demoWallets[1].address,traits:[{trait_type:'Type',value:'Koda'},{trait_type:'Core',value:'Mystic'},{trait_type:'Head',value:'Crystal'}]},
  {collection:'OTHERDEED',token_id:'42861',owner_wallet:demoWallets[1].address,traits:[{trait_type:'Environment',value:'Biogenic Swamp'},{trait_type:'Sediment',value:'Biogenic'},{trait_type:'Resource',value:'Anima'}]},
  {collection:'EXPANDED',token_id:'19028',owner_wallet:demoWallets[0].address,traits:[{trait_type:'Environment',value:'Crystal Grove'},{trait_type:'Sediment',value:'Chemical Goo'},{trait_type:'Resource',value:'Shard'}]},
  {collection:'OTHERDEED',token_id:'67512',owner_wallet:demoWallets[1].address,traits:[{trait_type:'Environment',value:'Rainbow Atmos'},{trait_type:'Resource',value:'Ore'},{trait_type:'Artifact',value:'Ancient relic'}]}
].map((a,i) => ({...a,id:'demo-'+i,chain:'ethereum',image:'',asset_type:registry.collections.find(c => c.id === a.collection).type,demo:true,last_synced_at:null}));
const state = {
  wallets:storage.get('wallets',[]), assets:storage.get('assets',[]), mode:storage.get('mode','live'),
  guideSteps:storage.get('guideSteps',[false,false,false]), events:storage.get('events',[]),
  sort:storage.get('sort','PRICE_DESC'),filter:'ALL',search:'',utilityFilter:'ALL',view:'grid',page:'assets',loading:false,
  lastSynced:storage.get('lastSynced',null), apiAvailable:false, providers:null, stale:storage.get('stale',false), notice:''
};
let glyphModulePromise=null;
let glyphModule=null;
let glyphLoadingTimer=null;
function glyphContext(){return {wallets:state.wallets,assets:state.assets,collections:registry.collections};}
function ensureGlyph(restart=false){
  if(glyphModulePromise&&!restart)return glyphModulePromise;
  state.glyphLoadError='';
  if(!$('#glyph-styles')){const style=document.createElement('link');style.id='glyph-styles';style.rel='stylesheet';style.href='/glyph/glyph.css';document.head.append(style);}
  glyphModulePromise=import('/glyph/glyph.js').then(module=>{glyphModule=module;module.setContext(glyphContext());if(restart)module.restart();else module.mount();return module;}).catch(error=>{state.glyphLoadError='Glyph를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.';if(state.page==='activity')render();throw error;});
  clearTimeout(glyphLoadingTimer);glyphLoadingTimer=setTimeout(()=>{if(!state.glyph?.ready){state.glyphLoadError='Glyph 응답이 지연되고 있습니다. 팝업·네트워크 설정을 확인하고 다시 불러오세요.';if(state.page==='activity')render();}},20000);
  return glyphModulePromise;
}
const collectionFor = id => registry.collections.find(c => c.id === id);
const utilityFor = id => registry.utilities.find(u => u.id === id);
const matching = (assets=state.assets) => registry.utilities.filter(u => matchUtility(u,assets).match_status !== 'NOT_MATCHED');
const save = () => {for (const key of ['wallets','assets','mode','guideSteps','events','lastSynced','stale','sort']) storage.set(key,state[key]);};
function event(name, data={}) {
  const entry = {event_name:name,...data,session_id:sessionId,at:new Date().toISOString()};
  state.events.push(entry);state.events=state.events.slice(-2000);storage.set('events',state.events);
  if(state.apiAvailable) fetch('/api/v1/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)}).catch(()=>{});
}
let sessionId = storage.get('session',null);
if (!sessionId) {sessionId=crypto.randomUUID();storage.set('session',sessionId);}
function hydrateIcons(root=document) {$$("[data-icon]",root).forEach(el => {el.innerHTML=icon(el.dataset.icon);});}
function statusBadge(status) {return `<span class="status ${status.toLowerCase()}">${status==='SIMULATED'?'SIMULATED':status==='UNAVAILABLE'?'UNAVAILABLE':status}</span>`;}
function toast(message,error=false) {const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('#toasts').append(el);setTimeout(()=>el.remove(),5000);}
function pageHeading(title,subtitle,action=true) {return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action?`<div class="heading-actions"><span class="mode-label">${icon('shield')}Read-only mode</span></div>`:''}</div>`;}
function demoBar() {return state.mode==='demo'?`<div class="demo-bar"><span>${icon('info')} 샘플 포트폴리오 · NFT 이미지와 보유 정보는 체험용입니다.</span><a class="text-btn" href="#wallets">내 지갑 조회 ${icon('arrow')}</a></div>`:'';}
function totalValueContent(){
  const summary=sumAssetValues(state.assets);const pending=state.assets.some(a=>pricePending.has(a.id));
  const value=state.mode==='demo'?'—':summary.value_eth==null?'—':formatEth(summary.value_eth);
  let foot=state.mode==='demo'?'샘플 자산 · 평가액 미제공':!state.assets.length?'지원 컬렉션 NFT 기준':pending?'가격 조회 중 · '+summary.priced_count+'/'+summary.total_count+'개 확인':summary.unpriced_count?'확인된 가격 합계 · 미확인 '+summary.unpriced_count+'개':'판매가·Portfolio 평가액 합산';
  return '<div class="stat-label">Total value (ETH) '+icon('diamond')+'</div><div class="stat-number total-value-number"><span class="total-value-amount">'+esc(value)+'</span><small>ETH</small></div><div class="stat-foot" aria-live="polite">'+esc(foot)+'</div>';
}
function statCards() {
  const matched=matching();const live=matched.filter(u=>u.status==='LIVE').length;
  return '<div class="stats"><div class="stat stat-lime" id="total-value-stat">'+totalValueContent()+'</div><div class="stat"><div class="stat-label">Total NFTs '+icon('layers')+'</div><div class="stat-number">'+state.assets.length+'<small>NFTs in your portfolio</small></div><div class="stat-foot">'+(state.mode==='demo'?'Sample portfolio':'지원 컬렉션 자산만 표시')+'</div></div><div class="stat"><div class="stat-label">Added wallets '+icon('wallet')+'</div><div class="stat-number">'+state.wallets.length+'<small>on Ethereum</small></div><div class="stat-foot">소유권 인증 없이 읽기 전용 조회</div></div><div class="stat stat-lime"><div class="stat-label">Matched utilities '+icon('sparkles')+'</div><div class="stat-number">'+matched.length+'<small>possibilities to explore</small></div><div class="stat-foot"><span class="tiny-dot"></span>'+live+' LIVE · '+(matched.length-live)+' sample scenarios</div></div></div>';
}
function assetArt(asset) {
  const art=collectionFor(asset.collection)?.art||'land';
  return asset.image?`<img class="real-image" src="${esc(asset.image)}" alt="${esc(collectionFor(asset.collection)?.short)} #${esc(asset.token_id)}" loading="lazy" referrerpolicy="no-referrer" data-fallback="true">`:asset.demo?`<div class="nft-art art-${art}" role="img" aria-label="체험용 ${esc(collectionFor(asset.collection)?.short)} 일러스트"></div>`:`<div class="image-placeholder">${icon('layers')}<span>Image unavailable</span></div>`;
}

const pricePending=new Set();
const priceAttempts=new Map();
function assetOpenSeaUrl(asset){return 'https://opensea.io/item/ethereum/'+encodeURIComponent(asset.contract||collectionFor(asset.collection).contract)+'/'+encodeURIComponent(asset.token_id);}
function priceMarkup(asset,detail=false){
  if(asset.demo)return '<div class="asset-price-row"><span>샘플 · 가격 미제공</span></div>';
  const price=asset.market_price?.quote_schema===3?asset.market_price:null;const p=pricePresentation(price,!price||pricePending.has(asset.id));
  const time=price?.quoted_at?formatDate(price.quoted_at):'';
  const source=price?'OpenSea · '+time:'';
  const row='<div class="asset-price-row" title="'+esc(source)+'"><strong class="'+(p.available?'text-lime':'price-muted')+'">'+esc(p.amount)+'</strong></div>';
  if(!detail)return row;
  return row+(price?'<p class="price-source">'+esc(source)+'</p>':'')+(price?.kind==='PORTFOLIO_VALUE'?'<p class="price-source">Portfolio 추정 가치 · 컬렉션 최고 구매 제안 기준'+(price.original_currency==='WETH'?' (WETH를 ETH와 1:1로 표시)':'')+'</p>':'');
}
function updatePriceElements(){
  const total=$('#total-value-stat');if(total)total.innerHTML=totalValueContent();
  $$('[data-wallet-metrics]').forEach(el=>{const wallet=state.wallets.find(w=>w.address.toLowerCase()===el.dataset.walletMetrics.toLowerCase());if(wallet)el.innerHTML=walletMetricsContent(wallet);});
  reorderAssetCards();
  $$('[data-price-asset]').forEach(el=>{const asset=state.assets.find(a=>a.id===el.dataset.priceAsset);if(asset)el.innerHTML=priceMarkup(asset,el.dataset.priceDetail==='true');});
}
async function loadAssetPrices(){
  const now=Date.now();const assets=state.assets.filter(a=>!a.demo&&a.contract&&!pricePending.has(a.id)&&now-(priceAttempts.get(a.id)||0)>10000&&(!a.market_price||a.market_price.quote_schema!==3||a.market_price.stale||now-Date.parse(a.market_price.quoted_at)>=(a.market_price.kind==='UNAVAILABLE'?10000:PRICE_REFRESH_MS)||a.market_price.expires_at&&Date.parse(a.market_price.expires_at)<=now));
  for(const a of assets){pricePending.add(a.id);priceAttempts.set(a.id,now);}
  if(!assets.length)return;updatePriceElements();
  for(let i=0;i<assets.length;i+=12){
    const batch=assets.slice(i,i+12);
    try{
      const response=await fetch('/api/v1/assets/prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assets:batch.map(a=>({contract:a.contract,token_id:a.token_id}))}),signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw new Error('PRICE_UNAVAILABLE');const data=await response.json();
      const quotes=new Map(data.prices.map(p=>[p.id,p.market_price]));
      state.assets=state.assets.map(a=>quotes.has(a.id)?{...a,market_price:quotes.get(a.id)}:a);
    }catch{
      const ids=new Set(batch.map(a=>a.id));
      state.assets=state.assets.map(a=>ids.has(a.id)?{...a,market_price:{quote_schema:3,kind:'UNAVAILABLE',currency:'ETH',value_eth:null,quoted_at:new Date().toISOString(),reason:'PROVIDER_UNAVAILABLE'}}:a);
    }finally{for(const a of batch)pricePending.delete(a.id);save();updatePriceElements();}
  }
}

function assetCard(asset) {
  const c=collectionFor(asset.collection);const count=matching([asset]).length;
  return `<button class="asset-card" data-asset="${esc(asset.id)}" aria-label="${esc(c.short)} #${esc(asset.token_id)} 상세 보기"><div class="asset-image">${assetArt(asset)}<span class="card-tag">${icon(asset.asset_type==='LAND'?'globe':'layers')}${esc(c.short)}</span><span class="card-chain" title="Ethereum">⟠</span></div><div class="asset-body"><div class="asset-collection">${esc(c.name)}<span class="verified">${icon('verified')}</span></div><h3 class="asset-title">${esc(c.short)} <span class="asset-token-id">#${esc(asset.token_id)}</span></h3><div data-price-asset="${esc(asset.id)}">${priceMarkup(asset)}</div><div class="card-bottom"><span>${icon('sparkles')}${count} utilities</span><span class="wallet-id">${short(asset.owner_wallet)}</span>${icon('arrow')}</div></div></button>`;
}
function sortControl(){return '<label class="asset-sort-control"><span>정렬</span><select id="asset-sort" aria-label="NFT 정렬 기준">'+SORT_OPTIONS.map(([value,label])=>'<option value="'+value+'" '+(state.sort===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label>';}
function sortNote(){return '<p class="asset-sort-note">'+(state.sort==='RECENT'?'지갑으로 마지막 전송된 시각 기준 · 취득 시각 미확인 '+state.assets.filter(a=>acquisitionTime(a)==null).length+'개는 뒤에 표시':'OpenSea 판매가 · 미등록 자산은 Portfolio 평가액 기준 · 가격 미확인 자산은 뒤에 표시')+'</p>';}
function reorderAssetCards(){const grid=$('#asset-grid');if(!grid)return;const cards=new Map([...grid.querySelectorAll('[data-asset]')].map(el=>[el.dataset.asset,el]));for(const a of filteredAssets()){const card=cards.get(a.id);if(card)grid.append(card);}}
let acquisitionUpgradePending=false;
const acquisitionUpgradeAttempts=new Set();
async function upgradeAcquisitionTimes(){
  const missing=state.assets.filter(a=>!a.demo&&!Object.hasOwn(a,'acquired_at')&&!acquisitionUpgradeAttempts.has(a.id));
  if(acquisitionUpgradePending||!missing.length||!state.wallets.length)return;
  acquisitionUpgradePending=true;missing.forEach(a=>acquisitionUpgradeAttempts.add(a.id));
  try{
    const response=await fetch('/api/v1/portfolio/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallets:state.wallets.filter(w=>!w.demo).map(w=>w.address)}),signal:AbortSignal.timeout(120000)});
    if(!response.ok)return;const data=await response.json();
    const found=new Map(data.assets.map(a=>[a.id+':'+a.owner_wallet,a]));
    state.assets=state.assets.map(a=>{const fresh=found.get(a.id+':'+a.owner_wallet);return fresh?{...a,acquired_at:fresh.acquired_at??null}:a;});save();
    if(state.sort==='RECENT'&&state.page==='assets')render();
  }catch{/* Unverified acquisition dates stay unknown. */}finally{acquisitionUpgradePending=false;}
}
function tabs() {return `<div class="collection-tabs" role="group" aria-label="컬렉션 필터">${[{id:'ALL',short:'All assets'},...registry.collections].map(c=>`<button class="tab ${state.filter===c.id?'selected':''}" data-filter="${c.id}" aria-pressed="${state.filter===c.id}">${esc(c.short)}${c.id==='ALL'?`<span class="tab-count">${state.assets.length}</span>`:''}</button>`).join('')}</div>`;}
function filteredAssets() {return sortAssets(state.assets.filter(a=>(state.filter==='ALL'||a.collection===state.filter)&&(!state.search||`${collectionFor(a.collection)?.name} ${a.token_id} ${a.owner_wallet}`.toLowerCase().includes(state.search.toLowerCase()))),state.sort);}
function assetGrid(large=false) {
  const assets=filteredAssets();
  return `<div class="asset-grid ${large?'large-grid':''} ${state.view==='list'?'list-view':''}" id="asset-grid">${assets.length?assets.map(assetCard).join(''):`<div class="empty-state">${icon('layers')}<h3>${state.assets.length?'검색 결과가 없습니다':'아직 조회된 자산이 없습니다'}</h3><p>${state.assets.length?'다른 컬렉션이나 Token ID로 검색해 보세요.':'지갑 주소를 추가하고 지원 컬렉션 자산을 조회하세요.'}</p>${state.assets.length?'<button class="btn btn-outline" data-action="reset-filter">필터 초기화</button>':'<button class="btn btn-primary" data-action="add-wallet">지갑 추가</button>'}</div>`}</div>`;
}
function heroWalletForm() {
  return `<form class="wallet-form wallet-search hero-wallet-search" id="hero-wallet-form" novalidate><span class="wallet-search-field">${icon('search')}<input id="hero-wallet-input" type="text" autocomplete="off" spellcheck="false" placeholder="0x로 시작하는 지갑 주소를 입력하세요" aria-label="조회할 EVM 지갑 주소" aria-describedby="hero-wallet-error" maxlength="42" value="${esc(state.heroAddress||'')}" ${state.loading?'readonly':''}></span><button class="wallet-search-submit" type="submit" ${state.loading?'disabled':''}>${state.loading?'조회 중…':'검색'} ${icon('arrow')}</button></form><div id="hero-wallet-error" class="hero-wallet-error" role="alert">${esc(state.heroError||'')}</div>`;
}
function assetsPage() {
  return `<section class="hero" aria-label="Other Bridge 소개"><div class="hero-content"><h2>Your assets.<br><span>More possibilities.</span></h2>${heroWalletForm()}</div><div class="hero-coordinate">THE BRIDGE TO YOUR NEXT WORLD ↗</div></section>${demoBar()}${statCards()}<section class="assets-portfolio"><div class="section-heading"><h2>ASSETS <span class="inline-count">${state.assets.length}</span></h2></div><div class="toolbar"><div class="search-field">${icon('search')}<input type="search" id="asset-search" placeholder="컬렉션, Token ID, 지갑 주소 검색" aria-label="자산 검색" value="${esc(state.search)}"></div><div class="portfolio-controls"><button class="text-btn ${state.loading?'spin':''}" data-action="refresh" ${state.loading?'disabled':''}>${icon('refresh')}${state.loading?'조회 중…':'새로고침'}</button><div class="view-switch"><button class="${state.view==='grid'?'selected':''}" data-view="grid" aria-label="그리드 보기">${icon('overview')}</button><button class="${state.view==='list'?'selected':''}" data-view="list" aria-label="목록 보기">${icon('list')}</button></div></div></div><div class="filter-row">${tabs()}${sortControl()}</div>${state.sort==='TOKEN_ASC'?'':sortNote()}${assetGrid(true)}<p class="portfolio-note">${icon('info')}${state.mode==='demo'?'체험용 샘플 자산 · 실제 보유 정보가 아닙니다.':state.stale?'최근 캐시 · 소유 정보가 변경되었을 수 있습니다.':`마지막 조회 ${formatDate(state.lastSynced)} · 읽기 전용`}</p></section>`;
}

function utilityPage() {
  const utilities=registry.utilities.filter(u=>state.utilityFilter==='ALL'||state.utilityFilter==='MATCHED'&&matchUtility(u,state.assets).match_status!=='NOT_MATCHED'||u.category===state.utilityFilter||u.status===state.utilityFilter);
  return `${pageHeading('Ownership opens possibilities.','자산의 가치가 쓰임으로 이어지는 곳. 이용 조건과 상태를 확인하고 다음 행동을 선택하세요.')}${demoBar()}<div class="registry-filters">${[['ALL','All utilities'],['MATCHED','Matched to you'],['ACCESS','Access'],['GAME','Game'],['ECONOMIC','Economic'],['IP','IP & ownership'],['LIVE','Live now'],['SIMULATED','Simulated']].map(([id,label])=>`<button class="tab ${state.utilityFilter===id?'selected':''}" data-utility-filter="${id}" aria-pressed="${state.utilityFilter===id}">${label}</button>`).join('')}</div><div class="registry-grid">${utilities.length?utilities.map(u=>`<article class="registry-card"><div class="registry-top"><span class="utility-icon ${u.status==='SIMULATED'?'purple':''}">${icon(u.icon)}</span>${statusBadge(u.status)}</div><div class="eyebrow" style="font-size:8px">${esc(u.category)}</div><h3>${esc(u.title)}</h3><p>${esc(u.description)}</p><div class="registry-meta">${u.collections.map(id=>collectionFor(id).short).join(' · ')}</div><button class="btn btn-outline" data-utility="${u.id}">${esc(u.title_ko)} ${icon('arrow')}</button></article>`).join(''):'<div class="empty-state"><h3>매칭된 유틸리티가 없습니다.</h3><p>지원 컬렉션 자산이 있는 지갑을 먼저 조회하세요.</p></div>'}</div><div class="inline-message">LIVE는 확인된 현재 기능, SIMULATED는 요구사항 기반 체험 시나리오입니다. 보유 조건 일치는 최종 이용 자격을 뜻하지 않습니다. 공식 발표나 로드맵을 검증하지 못한 항목에는 ANNOUNCED·PLANNED를 부여하지 않습니다.</div>`;
}
function walletMetricsContent(wallet){
  const summary=summarizeWallet(wallet,state.assets,{pending:pricePending});
  const value=summary.value_eth==null?'—':formatEth(summary.value_eth);
  let note=summary.demo?'샘플 · 평가액 미제공':!summary.queried?'보유 자산 조회 필요':summary.pending_count?'가격 조회 중 · '+summary.priced_count+'/'+summary.total_count+'개 확인':summary.unpriced_count?'확인된 가격 합계 · 미확인 '+summary.unpriced_count+'개':summary.total_count?'판매가·Portfolio 평가액 합산':'지원 컬렉션 자산 없음';
  if(summary.stale)note='최근 보유 캐시 · '+note;
  return '<div class="wallet-metric"><span>보유 NFT</span><strong data-wallet-nft-count>'+esc(summary.nft_count??'—')+'</strong></div><div class="wallet-metric wallet-value-metric"><span>자산 (ETH)</span><strong data-wallet-eth title="'+esc(note)+'" aria-label="'+esc(value+' ETH · '+note)+'">'+esc(value)+'</strong></div><small class="wallet-metrics-note">'+esc(note)+'</small>';
}
function walletRow(wallet){
  return '<div class="wallet-row" data-wallet-address="'+esc(wallet.address)+'"><span class="wallet-symbol">'+icon('wallet')+'</span><div class="wallet-identity"><div class="wallet-address-line"><span class="wallet-address" title="'+esc(wallet.address)+'">'+esc(wallet.address)+'</span><button type="button" class="icon-button wallet-copy" data-copy="'+esc(wallet.address)+'" aria-label="지갑 주소 복사" title="지갑 주소 복사">'+icon('copy')+'</button></div><div class="wallet-caption">'+esc(wallet.demo?'Sample wallet · 실제 조회하지 않은 체험용 주소':wallet.label||'Added wallet · Ethereum Mainnet')+'</div></div><div class="wallet-metrics" data-wallet-metrics="'+esc(wallet.address)+'" aria-live="polite">'+walletMetricsContent(wallet)+'</div><div class="wallet-actions"><button type="button" class="icon-button" data-remove-wallet="'+esc(wallet.address)+'" aria-label="지갑 삭제">'+icon('trash')+'</button></div></div>';
}
function walletPage() {return `${pageHeading('One bridge. Every wallet.','EVM 주소를 추가해 Yuga 자산을 읽기 전용으로 조회하세요.',false)}${demoBar()}<section class="wallet-panel"><h2>Your added wallets <span class="text-lime">${state.wallets.length}</span></h2><p>지갑 연결이나 서명 없이 공개된 NFT 보유 정보를 확인합니다.<br>지원 컬렉션: BAYC · MAYC · Koda · Otherdeed · Otherdeed Expanded</p>${walletForm()}<div class="wallet-list-head" aria-hidden="true"><span>지갑 주소</span><span>보유 NFT</span><span>자산 (ETH)</span></div><div id="wallet-list">${state.wallets.map(walletRow).join('')}</div><div class="inline-message ${state.notice?'error':''}" id="api-notice">${esc(state.notice||'실제 NFT 조회에는 서버의 ALCHEMY_API_KEY 설정이 필요합니다. 키가 없는 환경에서는 샘플 체험을 이용할 수 있으며 입력한 주소의 보유 정보를 생성하지 않습니다.')}</div><div class="modal-buttons"><button class="btn btn-primary ${state.loading?'loading':''}" data-action="resolve" ${state.loading?'disabled':''}>${icon('refresh')}${state.loading?'온체인 자산 조회 중…':'추가한 지갑 조회하기'}</button><button class="btn btn-outline" data-action="demo">샘플 포트폴리오 체험</button></div></section><div class="info-strip"><div>${icon('shield')}<span>주소는 비회원 세션 동안 보관합니다. 조회 중인 주소가 동일한 사람의 지갑임을 증명하지 않습니다.</span></div></div>`;}
function walletForm() {return `<form class="wallet-form wallet-search" id="wallet-form" novalidate><span class="wallet-search-field">${icon('search')}<input id="wallet-input" type="text" autocomplete="off" spellcheck="false" placeholder="지갑 주소 입력 (0x로 시작하는 EVM 주소)" aria-label="EVM 지갑 주소" aria-describedby="wallet-error" maxlength="42"></span><button class="wallet-search-submit" type="submit">주소 추가</button></form><div id="wallet-error" class="field-error" role="alert"></div>`;}
function activityPage() {
  return pageHeading('ACTIVITY','Glyph 인증 후 지갑별 연결 여부를 확인하세요.',false)+'<div id="glyph-onboarding-slot"><div class="glyph-loading-card"><span class="glyph-loading-orbit">✳</span><h2>Glyph 연결 준비 중</h2><p>공식 Glyph SDK를 불러오고 있습니다.</p><button class="btn btn-outline" data-action="retry-glyph">다시 불러오기</button></div></div>';
}
function analyticsPage() {
  const counts={};state.events.forEach(e=>counts[e.event_name]=(counts[e.event_name]||0)+1);
  const stages=[['portfolio_loaded','Portfolio views'],['utility_viewed','Utility discovery'],['guide_started','Guide started'],['official_link_clicked','Official link clicks']];
  const max=Math.max(1,...stages.map(([key])=>counts[key]||0));
  return `${pageHeading('From discovery to action.','이 브라우저 세션의 탐색 이벤트입니다. 공식 링크 클릭 이후의 게임 접속·플레이는 측정하지 않습니다.',false)}<div class="demo-bar"><span>${icon('info')}현재 비회원 세션의 로컬 이벤트 · 전체 사용자 분석이 아닙니다.</span><button class="text-btn" data-action="export-events">Export JSON ${icon('download')}</button></div><div class="stats analytics-stats">${[['Recorded events',state.events.length,'이 브라우저 세션'],['Utility views',counts.utility_viewed||0,'유틸리티 상세 조회'],['Guide starts',counts.guide_started||0,'가이드 진입 클릭'],['Outbound clicks',counts.official_link_clicked||0,'공식 CTA 클릭 · Proxy metric']].map(([title,n,sub])=>`<div class="stat"><div class="stat-label">${title} ${icon('chart')}</div><div class="stat-number">${n}</div><div class="stat-foot">${sub}</div></div>`).join('')}</div><section class="funnel"><h2>The discovery journey</h2>${stages.map(([key,label])=>`<div class="funnel-row"><span>${label}</span><div class="funnel-track"><div class="funnel-bar" style="width:${(counts[key]||0)/max*100}%"></div></div><span>${counts[key]||0}</span></div>`).join('')}<p class="portfolio-note">${icon('info')}이벤트 횟수 기준이며 사용자별 전환율 또는 실제 게임 성과가 아닙니다.</p></section><table class="events-table"><thead><tr><th>EVENT</th><th>CONTEXT</th><th>TIME</th></tr></thead><tbody>${state.events.slice(-12).reverse().map(e=>`<tr><td>${esc(e.event_name)}</td><td>${esc(e.utility_id||e.asset_id||e.destination||'Current session')}</td><td>${new Date(e.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</td></tr>`).join('')}</tbody></table>`;
}
function formatDate(value) {return value?new Date(value).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 조회하지 않음';}
const pages={assets:assetsPage,utilities:utilityPage,wallets:walletPage,activity:activityPage,analytics:analyticsPage};
function render() {
  const requested=location.hash.slice(1).toLowerCase();
  state.page=({overview:'assets',portfolio:'assets',onboarding:'activity'})[requested]||requested||'assets';if(!pages[state.page])state.page='assets';
  if(location.hash!=='#'+state.page)history.replaceState(history.state,'',location.pathname+location.search+'#'+state.page);
  $('#main-content').innerHTML=pages[state.page]();
  if(state.page==='activity'&&state.glyphLoadError){const message=$('#glyph-onboarding-slot .glyph-loading-card p');if(message)message.textContent=state.glyphLoadError;}
  const apiNotice=$('#api-notice');
  if(apiNotice){apiNotice.textContent=state.notice||(state.providers?.ownership?`${state.providers.ownership==='alchemy'?'Alchemy':'OpenSea'} 보유 조회 연결됨 · ${state.providers.metadata?'OpenSea 메타데이터 보완 연결됨':'보유 조회 응답의 메타데이터 사용'}`:'API 연결 상태를 확인 중입니다. 조회한 주소의 실제 보유 정보만 표시합니다.');apiNotice.classList.toggle('success',Boolean(state.providers?.ownership)&&!state.notice);}
  const labels={assets:'ASSETS',utilities:'UTILITIES',wallets:'Wallets',activity:'ACTIVITY',analytics:'Analytics'};
  $('#breadcrumb-current').textContent=labels[state.page];
  $$('.nav-item[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===state.page));
  $('#nav-asset-count').textContent=state.assets.length;$('#nav-wallet-count').textContent=state.wallets.length;
  hydrateIcons();bindContent();
  if(glyphModule)glyphModule.setContext(glyphContext());
  window.dispatchEvent(new Event('otherbridge:render'));
  if(state.page==='activity')void ensureGlyph().catch(()=>{});
  if(['assets','wallets'].includes(state.page))void loadAssetPrices();
  if(state.sort==='RECENT'&&(state.page==='assets'))void upgradeAcquisitionTimes();
}
function bindContent(root=$('#main-content')) {
  $$('[data-action]',root).forEach(el=>el.addEventListener('click',()=>handleAction(el.dataset.action)));
  $$('[data-asset]',root).forEach(el=>el.addEventListener('click',()=>showAsset(el.dataset.asset)));
  $$('[data-utility]',root).forEach(el=>el.addEventListener('click',()=>showUtility(el.dataset.utility)));
  $$('[data-filter]',root).forEach(el=>el.addEventListener('click',()=>{state.filter=el.dataset.filter;render();}));
  $$('[data-view]',root).forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.view;render();}));
  $$('[data-utility-filter]',root).forEach(el=>el.addEventListener('click',()=>{state.utilityFilter=el.dataset.utilityFilter;render();}));
  $$('[data-remove-wallet]',root).forEach(el=>el.addEventListener('click',()=>removeWallet(el.dataset.removeWallet)));
  $$('[data-copy]',root).forEach(el=>el.addEventListener('click',()=>copy(el.dataset.copy)));
  $$('[data-complete-step]',root).forEach(el=>el.addEventListener('click',()=>{const n=Number(el.dataset.completeStep);state.guideSteps[n]=!state.guideSteps[n];if(state.guideSteps[n])event('guide_step_completed',{step:n});save();render();}));
  $$('[data-fallback]',root).forEach(el=>el.addEventListener('error',()=>{el.replaceWith(Object.assign(document.createElement('div'),{className:'image-placeholder',textContent:'Image unavailable'}));}));
  const form=$('#wallet-form',root);if(form)form.addEventListener('submit',addWallet);
  const heroForm=$('#hero-wallet-form',root);if(heroForm){heroForm.addEventListener('submit',searchHeroWallet);$('input',heroForm).addEventListener('input',e=>{state.heroAddress=e.target.value;state.heroError='';$('#hero-wallet-error').textContent='';e.target.removeAttribute('aria-invalid');});}
  const sort=$('#asset-sort',root);if(sort)sort.addEventListener('change',e=>{state.sort=e.target.value;save();render();});
  const search=$('#asset-search',root);if(search)search.addEventListener('input',e=>{state.search=e.target.value;const grid=$('#asset-grid');const temp=document.createElement('div');temp.innerHTML=assetGrid(true);grid.replaceWith(temp.firstElementChild);bindContent($('#asset-grid'));});
}
function modal(content,eyebrow='OTHER BRIDGE') {$('#modal-content').innerHTML=content;$('#modal-eyebrow').textContent=eyebrow;hydrateIcons($('#modal'));bindContent($('#modal-content'));if(!$('#modal').open)$('#modal').showModal();$('#modal-content').scrollTop=0;$('#modal').scrollTop=0;}
function closeModal() {$('#modal').close();}
function showAsset(id,detailState='') {
  const scroll=detailState?$('#modal').scrollTop:0;
  const a=state.assets.find(a=>a.id===id);if(!a)return;state.activeAssetId=id;if(!detailState)event('asset_clicked',{asset_id:id});
  const c=collectionFor(a.collection);const utilities=matching([a]);const links=assetDetailLinks(a);
  const benefits=currentAssetBenefits(a,registry.benefits);
  const resources=a.traits.filter(t=>/resource|자원/i.test(t.trait_type));
  modal(`<div class="asset-detail-layout"><div class="asset-detail-image modal-asset-art">${assetArt(a)}</div><section class="asset-detail-info"><div class="detail-label">${esc(c.name)}</div><h2 id="modal-title" class="modal-title">${esc(c.short)} <span class="asset-token-id">#${esc(a.token_id)}</span></h2><div class="modal-subtitle">Ethereum · ${esc(a.asset_type)}</div><div class="asset-owner-address"><span>${esc(short(a.owner_wallet))}</span><button type="button" class="asset-address-copy" data-copy="${esc(a.owner_wallet)}" aria-label="지갑 주소 복사" title="지갑 주소 복사">${icon('copy')}</button></div><div class="asset-detail-links">${links?`<a class="source-link" data-asset-market href="${esc(links.opensea)}" target="_blank" rel="noopener noreferrer">OpenSea에서 확인 ${icon('external')}</a><a class="source-link" data-asset-chain href="${esc(links.etherscan)}" target="_blank" rel="noopener noreferrer">Etherscan에서 확인 ${icon('external')}</a>`:'<span class="asset-detail-empty">체험용 샘플 자산</span>'}</div><div class="asset-price-detail" data-price-detail="true" data-price-asset="${esc(a.id)}">${priceMarkup(a,true)}</div></section><section class="asset-detail-traits"><div class="asset-panel-heading"><h3>Traits</h3><span>${a.traits.length}</span></div><p class="asset-detail-caption">NFT 메타데이터의 전체 속성</p><div class="asset-traits-scroll" tabindex="0" aria-label="전체 NFT Traits">${renderAllTraits(a.traits)}</div></section><section class="asset-detail-uses"><div class="asset-panel-heading"><h3>이 NFT로 할 수 있는 것</h3><span>${utilities.length}</span></div><div class="asset-utility-list">${resources.length?`<div class="asset-resource-summary"><strong>자원 속성</strong><p>${resources.map(t=>esc(t.trait_type)+': '+esc(t.value)).join(' · ')}</p><small>채집 가능 여부와 수수료는 공식 서비스의 현재 조건을 확인하세요.</small></div>`:''}${utilities.map(u=>`<button class="detail-utility" data-utility="${u.id}"><span class="utility-icon ${u.status==='SIMULATED'?'purple':''}">${icon(u.icon)}</span><div><strong>${esc(u.title_ko)}</strong><small>${esc(u.description)}</small></div>${statusBadge(u.status)}${icon('arrow')}</button>`).join('')||'<p class="asset-detail-empty">현재 확인된 활용 정보가 없습니다.</p>'}</div><div class="asset-benefits"><h3>현재 확인된 혜택</h3>${benefits.length?benefits.map(b=>`<a class="asset-benefit" href="${esc(b.source_url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(b.title_ko||b.title)}</strong><p>${esc(b.description)}</p><small>보유 조건 기준 · 세부 자격은 공식 서비스에서 확인 ${icon('external')}</small></a>`).join(''):`<p class="asset-detail-empty">현재 확인된 보상·Claim 정보가 없습니다.</p><a class="source-link" href="${['BAYC','MAYC'].includes(a.collection)?'https://boredapeyachtclub.com/':'https://www.otherside.xyz/'}" target="_blank" rel="noopener noreferrer">최신 혜택·이용 조건 확인 ${icon('external')}</a>`}</div></section></div><div class="asset-detail-footer"><p>${a.demo?'체험용 샘플 NFT · 실제 보유 정보가 아닙니다.':`보유 지갑: <span class="data-text">${esc(a.owner_wallet)}</span><br>마지막 보유 조회: ${esc(formatDate(a.last_synced_at))}`}</p><p class="asset-metadata-state" role="status">${esc(a.demo?'샘플 메타데이터':detailState||'Alchemy · OpenSea에서 메타데이터 확인 중…')}</p></div>`,c.short+' · ASSET DETAILS');
  if(detailState)$('#modal').scrollTop=scroll;
  if(!a.demo&&!detailState)loadAssetDetails(id);
}

async function loadAssetDetails(id){
  const asset=state.assets.find(a=>a.id===id);if(!asset||asset.demo)return;
  try{
    const response=await fetch(`/api/v1/assets/${encodeURIComponent(id)}?owner=${encodeURIComponent(asset.owner_wallet)}`,{signal:AbortSignal.timeout(45000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'상세 정보를 불러오지 못했습니다.');
    state.assets=state.assets.map(a=>a.id===id?{...data.asset,market_price:a.market_price}:a);save();
    if($('#modal').open&&state.activeAssetId===id&&$('#modal-content .asset-detail-layout')){render();showAsset(id,`보유 정보: ${data.asset.ownership_source||'Alchemy'} · 메타데이터: ${(data.asset.metadata_sources||[]).join(' + ')}${data.warning?' · '+data.warning:''}`);}
  }catch(error){if($('#modal').open&&state.activeAssetId===id&&$('#modal-content .asset-detail-layout'))showAsset(id,error.message);}
}
function showUtility(id) {
  state.activeAssetId=null;
  const u=utilityFor(id);if(!u)return;event('utility_viewed',{utility_id:id});const match=matchUtility(u,state.assets);
  modal(`<div class="utility-detail-top"><span class="utility-icon ${u.status==='SIMULATED'?'purple':''}">${icon(u.icon)}</span>${statusBadge(u.status)}<span class="detail-label" style="margin:0">${esc(u.category)}</span></div><h2 class="modal-title" id="modal-title">${esc(u.title)}</h2><p class="modal-subtitle">${esc(u.description)}</p><div class="detail-grid"><div><div class="detail-label">SUPPORTED COLLECTIONS</div><div class="detail-value">${u.collections.map(id=>collectionFor(id).short).join(' · ')}</div></div><div><div class="detail-label">REQUIREMENT MATCH</div><div class="detail-value">${state.mode==='demo'?'Sample · ':''}${match.match_status}</div></div><div><div class="detail-label">SOURCE</div><div class="detail-value">${u.source_type==='OFFICIAL'?'Official public information':'Requirement-based scenario · Assumption'}</div></div><div><div class="detail-label">LAST VERIFIED</div><div class="detail-value">${u.last_verified_at||'미검증 · Future scenario'}</div></div></div><div class="modal-notice">${esc(match.reason)}<br>Additional conditions may apply. 최종 자격은 공식 서비스에서 확인하세요.</div><div class="modal-section"><h3>Your next steps</h3>${u.steps.map((s,i)=>`<div class="journey-step"><span class="step-marker">${i+1}</span><div><strong>${esc(s)}</strong></div></div>`).join('')}</div><a class="source-link" href="${esc(u.source_url)}" target="_blank" rel="noopener noreferrer">${u.source_type==='OFFICIAL'?'공식 근거 확인':'공식 사이트에서 최신 정보 확인'} ${icon('external')}</a><div class="modal-buttons"><button class="btn btn-primary" data-action="start-guide" ${u.status==='UNAVAILABLE'?'disabled':''}>${esc(u.action)} ${icon('arrow')}</button><a class="btn btn-outline" href="${esc(u.destination_url)}" target="_blank" rel="noopener noreferrer" data-official="${u.category==='IP'?'bayc':'otherside'}" data-utility-id="${u.id}" ${u.status==='UNAVAILABLE'?'aria-disabled="true" tabindex="-1"':''}>공식 페이지 ${icon('external')}</a></div>`,u.category+' · UTILITY DETAILS');
}
async function copy(value) {try{await navigator.clipboard.writeText(value);toast('지갑 주소를 복사했습니다.');}catch{toast('클립보드에 접근할 수 없습니다. 브라우저의 클립보드 권한을 확인하세요.',true);}}
function showAddWallet() {modal(`<h2 id="modal-title" class="modal-title">Bring your wallet.</h2><p class="modal-subtitle">공개 EVM 주소만 입력하세요. 서명이나 지갑 연결은 필요하지 않습니다.<br>최대 20개 주소를 추가할 수 있습니다.</p>${walletForm()}<div class="modal-notice">읽기 전용 조회 · Private key, seed phrase는 입력하지 마세요.<br>비회원 주소 목록은 이 브라우저 세션 동안만 보관합니다.</div><div class="modal-buttons"><button class="btn btn-outline" data-action="wallet-page">추가한 지갑 확인 ${icon('arrow')}</button></div>`,'READ-ONLY WALLET');setTimeout(()=>$('#wallet-input',$('#modal'))?.focus(),100);}
function addWallet(e) {
  e.preventDefault();const form=e.currentTarget;const input=$('input',form);const value=input.value.trim();const error=form.nextElementSibling;
  const fail=message=>{error.textContent=message;input.setAttribute('aria-invalid','true');input.focus();};
  if(!EVM_ADDRESS.test(value))return fail('0x + 40자리 16진수로 된 EVM 주소를 입력하세요.');
  if(state.wallets.some(w=>w.address.toLowerCase()===value.toLowerCase()))return fail('이미 추가한 지갑 주소입니다.');
  if(state.wallets.filter(w=>!w.demo).length>=20)return fail('지갑은 최대 20개까지 추가할 수 있습니다.');
  if(state.mode==='demo'){state.wallets=[];state.assets=[];state.mode='live';state.guideSteps=[false,false,false];}
  state.wallets.push({address:value.toLowerCase(),label:'Added wallet',demo:false});state.notice='';state.lastSynced=null;save();event('wallet_added');input.value='';error.textContent='';input.removeAttribute('aria-invalid');closeModal();location.hash='wallets';render();toast('주소를 추가했습니다. ‘추가한 지갑 조회하기’로 자산을 확인하세요.');
}
async function searchHeroWallet(e) {
  e.preventDefault();if(state.loading)return;
  const input=$('input',e.currentTarget);const value=input.value.trim().toLowerCase();state.heroAddress=value;state.heroError='';
  const fail=message=>{state.heroError=message;$('#hero-wallet-error').textContent=message;input.setAttribute('aria-invalid','true');input.focus();};
  if(!EVM_ADDRESS.test(value))return fail('0x + 40자리 16진수로 된 EVM 지갑 주소를 입력하세요.');
  const exists=state.mode!=='demo'&&state.wallets.some(w=>w.address.toLowerCase()===value);
  if(!exists&&state.wallets.filter(w=>!w.demo).length>=20)return fail('최대 20개 주소까지 조회할 수 있습니다. 지갑 목록에서 주소를 삭제한 후 다시 시도하세요.');
  if(state.mode==='demo'){state.wallets=[];state.assets=[];state.mode='live';state.guideSteps=[false,false,false];state.lastSynced=null;}
  if(!exists){state.wallets.push({address:value,label:'Added wallet',demo:false});event('wallet_added');}
  state.filter='ALL';state.search='';save();await resolvePortfolio();
  if(state.notice&&state.page==='assets'){state.heroError=state.notice;const error=$('#hero-wallet-error');if(error)error.textContent=state.heroError;}
}
function removeWallet(address) {state.wallets=state.wallets.filter(w=>w.address!==address);state.assets=state.assets.filter(a=>a.owner_wallet!==address);save();render();toast('조회 목록에서 지갑을 삭제했습니다.');}
async function resolvePortfolio(force=false,{navigate=true,quiet=false}={}) {
  if(state.loading)return;if(!state.wallets.length){showAddWallet();return;}
  if(state.mode==='demo'){event('portfolio_loaded',{mode:'demo'});toast('샘플 포트폴리오를 새로고침했습니다. 실제 조회는 내 지갑 주소를 추가해 시작하세요.');return;}
  const addresses=state.wallets.map(w=>w.address);const walletScope=[...addresses].map(a=>a.toLowerCase()).sort().join('|');
  state.loading=true;state.notice='';refreshWalletView();
  try {
    const response=await fetch('/api/v1/portfolio/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallets:addresses,force}),signal:AbortSignal.timeout(120000)});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json'))throw new Error('조회 서버에서 올바른 응답을 받지 못했습니다. 잠시 후 다시 시도하세요.');
    const data=await response.json();if(!response.ok)throw new Error(data.error||'조회 중 오류가 발생했습니다.');
    if(walletScope!==state.wallets.map(w=>w.address.toLowerCase()).sort().join('|'))return;
    if(Array.isArray(data.wallets))state.wallets=state.wallets.map(wallet=>{const result=data.wallets.find(result=>result.address.toLowerCase()===wallet.address.toLowerCase());return {...wallet,last_synced_at:result?.last_synced_at||null,holdings_stale:Boolean(result?.stale)};});
    state.assets=data.assets;state.lastSynced=data.last_synced_at;state.stale=Boolean(data.stale);state.notice=data.warning||'';save();event('portfolio_loaded',{asset_count:state.assets.length,mode:'live'});if(!quiet)toast(data.stale?'API 오류로 최근 캐시를 표시합니다.':`${state.wallets.length}개 지갑에서 ${state.assets.length}개 지원 자산을 조회했습니다.`);if(navigate)location.hash='assets';
  }catch(error){state.notice=error.name==='TimeoutError'?'조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.':error.message;toast(state.notice,true);}
  finally{state.loading=false;refreshWalletView();void refreshGlyphPortfolio();}
}
function helpModal() {modal(`<div class="help-content"><h2 class="modal-title" id="modal-title">A bridge to what’s next.</h2><p>Other Bridge는 Yuga 생태계 NFT의 공개 보유 정보를 모으고, 유틸리티를 발견해 공식 Otherside 서비스로 이어주는 독립 프로젝트입니다. Yuga Labs의 공식 서비스는 아닙니다.</p><h3>01 · Bring your addresses</h3><p>여러 EVM 주소를 추가하고 지원 컬렉션을 통합 조회합니다. 서명 없이 주소를 조회하며, 주소 추가가 지갑 소유권 인증을 의미하지 않습니다.</p><h3>02 · Discover the possibilities</h3><p>LIVE · ANNOUNCED · PLANNED · SIMULATED · UNAVAILABLE로 상태를 구분합니다. 이 버전에서 검증한 Glyph 안내만 LIVE로, 나머지는 체험 시나리오로 표시합니다.</p><h3>03 · Take the next step</h3><p>가이드를 따라 공식 사이트에서 다음 단계를 확인하세요. Other Bridge에서 거래, 위임, Claim을 실행하지 않습니다.</p><div class="modal-notice">샘플 NFT 이미지·보유 데이터는 체험용입니다. 비회원 주소와 이벤트는 세션에 저장됩니다. 실제 NFT 조회 API 키는 서버 환경변수로만 설정합니다.</div><div class="modal-buttons"><button class="btn btn-primary" data-action="start-guide">ACTIVITY 열기 ${icon('arrow')}</button></div></div>`,'THE OTHER BRIDGE GUIDE');}
function handleAction(action) {
  if(action==='retry-glyph'){void ensureGlyph(true).catch(()=>{});}
  if(action==='add-wallet')showAddWallet();
  if(action==='start-guide'){event('utility_action_clicked',{utility_id:'glyph-onboarding'});event('guide_started');closeModal();location.hash='activity';render();}
  if(action==='help')helpModal();
  if(action==='refresh'||action==='resolve')resolvePortfolio(action==='refresh');
  if(action==='wallet-page'){closeModal();location.hash='wallets';render();}
  if(action==='reset-filter'){state.filter='ALL';state.search='';render();}
  if(action==='demo'){state.wallets=structuredClone(demoWallets);state.assets=structuredClone(sampleAssets);state.mode='demo';state.notice='';state.lastSynced=null;state.stale=false;save();event('portfolio_loaded',{mode:'demo'});location.hash='assets';render();toast('샘플 포트폴리오를 불러왔습니다.');}
  if(action==='export-events'){const blob=new Blob([JSON.stringify(state.events,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='other-bridge-events.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
let lastGlyphImportKey=null;
let glyphPortfolioQueued=false;
let glyphPortfolioRunning=false;
function refreshWalletView(){
  if(state.page!=='activity'){render();return;}
  $('#nav-wallet-count').textContent=state.wallets.length;$('#nav-asset-count').textContent=state.assets.length;
  if(glyphModule)glyphModule.setContext(glyphContext());
}
async function refreshGlyphPortfolio(){
  if(glyphPortfolioRunning||!glyphPortfolioQueued||state.loading)return;
  if(!state.wallets.length||state.mode!=='live'){glyphPortfolioQueued=false;return;}
  glyphPortfolioRunning=true;glyphPortfolioQueued=false;
  try{await resolvePortfolio(false,{navigate:false,quiet:true});}
  finally{glyphPortfolioRunning=false;if(glyphPortfolioQueued)void refreshGlyphPortfolio();}
}
function importGlyphAccountWallets(status){
  const result=mergeGlyphWallets(state.wallets,status);
  if(!result.import_key){lastGlyphImportKey=null;glyphPortfolioQueued=false;return;}
  if(result.import_key===lastGlyphImportKey)return;
  lastGlyphImportKey=result.import_key;
  const needsLookup=result.wallets.some(w=>result.account_addresses.includes(w.address)&&!w.last_synced_at);
  if(result.added.length){
    if(state.mode==='demo'){state.assets=[];state.lastSynced=null;state.stale=false;}
    state.wallets=result.wallets;state.mode='live';save();event('wallet_added',{source:'glyph',wallet_count:result.added.length});
    refreshWalletView();toast('Glyph 계정의 지갑 '+result.added.length+'개를 추가했습니다.');
  }
  if(result.added.length||needsLookup){glyphPortfolioQueued=true;void refreshGlyphPortfolio();}
  if(result.skipped.length)toast('최대 20개 지갑까지 지원하여 Glyph 지갑 '+result.skipped.length+'개를 추가하지 못했습니다. 지갑 목록을 정리한 뒤 다시 연결해 주세요.',true);
}
window.addEventListener('otherbridge:glyph-status',e=>{
  state.glyph=e.detail;if(e.detail.ready){state.glyphLoadError='';clearTimeout(glyphLoadingTimer);}
  importGlyphAccountWallets(e.detail);
  const caption=$('#profile-button small');if(caption)caption.textContent=e.detail.signedIn?'Glyph authenticated':'Guest session';
  // Glyph owns the onboarding portal; status updates must not replace its host.
  if(state.page==='activity'&&e.detail.error&&!$('#glyph-onboarding-slot .glyph-onboarding')){state.glyphLoadError=e.detail.error;render();}
});
window.addEventListener('otherbridge:glyph-event',e=>{const {event:name,...detail}=e.detail;event(name,detail);});

document.addEventListener('click',e=>{
  if(e.target.closest('[data-glyph-open]')){location.hash='activity';void ensureGlyph().catch(()=>{});}
  const link=e.target.closest('[data-official]');if(link){if(link.getAttribute('aria-disabled')==='true'){e.preventDefault();return;}const destination=link.dataset.official;event('official_link_clicked',{destination,utility_id:link.dataset.utilityId||null,step:link.dataset.step||null});if(destination==='glyph'||destination==='otherside')event(destination+'_link_clicked',{destination});}
});
$('#modal-close').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeModal();}});
$('#help-button').addEventListener('click',helpModal);$('#footer-about').addEventListener('click',helpModal);
$('#profile-button').addEventListener('click',()=>{location.hash='activity';void ensureGlyph().catch(()=>{});});
$('#notification-button').addEventListener('click',()=>modal(`<h2 id="modal-title" class="modal-title">Bridge updates.</h2><ul class="notification-list"><li><strong>Welcome to Other Bridge</strong><br>5개 Yuga 컬렉션의 유틸리티 탐색을 체험할 수 있습니다.</li><li><strong>Read-only by design</strong><br>지갑 서명이나 거래 없이 자산을 탐색하세요.</li><li><strong>Future scenarios are labeled</strong><br>샘플·미검증 기능은 SIMULATED로 구분합니다.</li></ul>`,'WHAT’S NEW'));
$('#menu-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
document.addEventListener('click',e=>{if(window.innerWidth<=700&&!e.target.closest('#sidebar')&&!e.target.closest('#menu-button'))$('#sidebar').classList.remove('open');});
window.addEventListener('hashchange',()=>{render();$('#sidebar').classList.remove('open');window.scrollTo({top:0});});
render();
setInterval(()=>{if(!document.hidden&&(['assets','wallets'].includes(state.page)||$('#modal').open&&$('#modal .asset-detail-layout'))){updatePriceElements();void loadAssetPrices();}},15000);
fetch('/api/v1/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(data=>{state.apiAvailable=data?.service==='other-bridge';state.providers=data?.providers||null;if(state.page==='wallets')render();}).catch(()=>{});
if(!state.events.some(e=>e.event_name==='portfolio_loaded'))event('portfolio_loaded',{mode:state.mode});
