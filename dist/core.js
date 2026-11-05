export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export function normalizeWallets(values) {
  if (!Array.isArray(values) || !values.length || values.length > 20) throw new Error('1~20개의 지갑 주소를 입력하세요.');
  if (values.some(value => typeof value !== 'string' || !EVM_ADDRESS.test(value.trim()))) throw new Error('올바른 EVM 주소를 입력하세요. (0x + 40자리 16진수)');
  return [...new Set(values.map(value => value.trim().toLowerCase()))];
}
export function matchUtility(utility, assets) {
  const supported = assets.filter(asset => utility.collections.includes(asset.collection));
  const matched = utility.requirements.every(rule => {
    if (rule.type === 'OWN_COLLECTION') return supported.some(asset => asset.collection === rule.collection);
    if (rule.type === 'MIN_QUANTITY') return supported.length >= rule.min;
    if (rule.type === 'TRAIT_EXISTS') return supported.some(asset => asset.traits?.some(trait => trait.trait_type === rule.trait && (rule.value == null || String(trait.value) === String(rule.value))));
    return false;
  });
  return {utility_id: utility.id, match_status: !matched ? 'NOT_MATCHED' : utility.verification_level === 'NOT_VERIFIABLE' ? 'NOT_VERIFIABLE' : 'OWNERSHIP_MATCHED', additional_verification_required: true, reason: matched ? utility.rule_reason : '필요 자산 또는 속성이 현재 조회 결과에 없습니다.'};
}
export function normalizeNft(nft, owner, collections) {
  const collection = collections.find(item => item.contract.toLowerCase() === nft.contract?.address?.toLowerCase());
  if (!collection || nft.tokenId == null) return null;
  const image = nft.image?.cachedUrl || nft.image?.thumbnailUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || '';
  const safeImage = /^https:\/\//i.test(image) ? image : image.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + image.slice(7).replace(/^ipfs\//, '') : '';
  return {id: `${collection.contract.toLowerCase()}:${nft.tokenId}`, collection: collection.id, chain: 'ethereum', contract: collection.contract.toLowerCase(), token_id: String(nft.tokenId), asset_type: collection.type, image: safeImage, traits: Array.isArray(nft.raw?.metadata?.attributes) ? nft.raw.metadata.attributes.filter(t => t && typeof t.trait_type === 'string' && ['string', 'number', 'boolean'].includes(typeof t.value)).map(t => ({trait_type: t.trait_type, value: t.value})) : [], owner_wallet: owner.toLowerCase(), last_synced_at: new Date().toISOString(), demo: false};
}
export function dedupeAssets(assets) {
  return [...new Map(assets.map(asset => [asset.id, asset])).values()];
}
