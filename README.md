# Other Bridge

NFT 자산 통합·Utility 탐색·Otherside 온보딩 웹앱. 배포 사이트와 로컬 서버 모두 Alchemy / OpenSea API를 동적으로 호출합니다.

## API 파이프라인

1. 사용자가 추가한 EVM 주소를 검사하고 중복을 제거합니다.
2. 서버가 Alchemy NFT API v3 `getNFTsForOwner`를 호출합니다. 5개 지원 컨트랙트 필터, 모든 응답 페이지 조회, 자산 정규화를 수행합니다.
3. 이미지나 속성이 없는 NFT는 OpenSea API v2 `GET /chain/ethereum/contract/{contract}/nfts/{tokenId}`로 보완합니다. 상세 창에서도 OpenSea 메타데이터를 동적으로 불러옵니다.
4. Alchemy 보유 조회 실패 시 OpenSea `GET /chain/ethereum/account/{address}/nfts`로 전환합니다. 숨겨진 NFT를 포함해 조회하도록 요청하지만 OpenSea 정책상 미노출 자산은 반환되지 않을 수 있습니다.
5. 보유 결과는 10분, OpenSea 메타데이터는 6시간 캐시합니다. ‘새로고침’은 보유 캐시를 우회합니다. API 오류 시 24시간 이내 보유 캐시를 갱신 시각·오래된 정보 경고와 함께 표시합니다.
6. 실제 조회의 빈 결과·실패·이미지 누락은 샘플 NFT로 대체하지 않습니다. 샘플은 명시적으로 ‘샘플 포트폴리오 체험’을 선택했을 때만 표시합니다.

지원: BAYC, MAYC, Koda, Otherdeed Original, Otherdeed Expanded. 자산 응답에는 `ownership_source`, `metadata_sources`, `last_synced_at`, `last_metadata_synced_at`를 포함합니다. OpenSea 메타데이터 보완은 보유 지갑이나 보유 조회 출처를 변경하지 않습니다.

## 로컬 실행

Node.js 22.13 이상. 프로젝트 루트 `.env`에 아래 서버 키를 저장하세요.

```dotenv
ALCHEMY_API_KEY=...
OPENSEA_API_KEY=...
PORT=3000
```

```powershell
npm run dev:local
```

http://localhost:3000 에서 프런트엔드와 실제 API를 함께 사용합니다. SQLite 캐시와 이벤트는 `.local/other-bridge.sqlite`에 저장됩니다. 기존 로컬 데이터는 삭제하지 않습니다.

## 배포

Sites의 Vinext / Cloudflare Worker 런타임으로 동작합니다. `app/api/v1/[...path]/route.ts`가 서버 요청을 처리하고 D1에 보유·메타데이터 캐시와 이벤트를 저장합니다. Registry는 `public/registry.json`, 실제 API 어댑터는 `lib/nft-providers.js`입니다.

배포 API 키는 Sites의 비밀 환경변수 `ALCHEMY_API_KEY`, `OPENSEA_API_KEY`로 설정합니다. 로컬 `.env`는 자동 업로드하지 않으며 Git·배포 아카이브에서 제외합니다. 프런트엔드에 API 키를 전달하지 않습니다. 키 변경을 배포에 적용하려면 해당 환경변수 수정 후 버전을 재배포합니다.

```powershell
node C:/Users/kaebi/.codex/plugins/cache/openai-curated-remote/sites/1.1.3/scripts/install-dependencies.mjs
npm run db:generate  # 스키마 변경 시에만
node C:/Users/kaebi/.codex/plugins/cache/openai-curated-remote/sites/1.1.3/scripts/build-site.mjs
```

`public/`은 작성한 정적 소스이며 `dist/`는 빌드 출력입니다. 배포에서는 D1, 간단한 로컬 실행에서는 SQLite를 사용하며 양쪽이 동일한 API·제공자 로직을 공유합니다.

## API

| Method | Endpoint | 용도 |
|---|---|---|
| GET | /api/v1/health | 제공자 연결 설정 상태. 키 값은 반환하지 않음 |
| POST | /api/v1/portfolio/resolve | `{ "wallets": ["0x…"], "force": false }` |
| GET | /api/v1/assets/{contract}:{tokenId}?owner=0x… | 보유 조회·메타데이터 보완·상세 |
| GET | /api/v1/utilities/{id} | Registry 항목 |
| POST | /api/v1/utilities/match | 보유 자산과 규칙 매칭 |
| POST | /api/v1/events | 허용된 서비스 이벤트 저장 |

## 검증

```powershell
npm run check
npm run test:live
node tests/browser-qa.mjs  # 로컬 서버가 3000 포트에서 실행 중이어야 함
```

자동 테스트는 페이지네이션, 컬렉션 필터링, 주소 검증, 중복 제거, 출처 보존, 메타데이터 보완, API 장애 전환, 캐시 우회와 만료, 오래된 캐시, 빈 결과, 오류 메시지 키 비노출을 검증합니다. `test:live`는 실제 OpenSea 메타데이터, Alchemy 보유 조회, OpenSea 보유 조회를 검사하고 공개 온체인 테스트 주소만 `.local/live-fixture.json`에 기록합니다.

## 범위

비회원 주소 목록·로컬 분석은 `sessionStorage`에 저장됩니다. 로그인·회원가입은 공식 Glyph SDK를 사용합니다. Glyph 인증용 메시지 서명은 사용자의 명시적인 인증 동작에서만 공식 SDK로 요청하며, 자체 인증 서버·Google OAuth·계정별 서버 동기화는 추가하지 않습니다. 유틸리티는 Registry에서 관리하며 보유 조건 매칭은 최종 캠페인 자격을 뜻하지 않습니다. 자산 거래·위임 트랜잭션·Claim·게임 로그는 다루지 않습니다.

## Glyph Stateful Onboarding (FR-08)

`client/glyph-entry.tsx`는 공식 `@use-glyph/sdk-react` 2.2.9의 Native Integration을 사용합니다. 별도의 Privy 앱 키를 요구하지 않습니다. `GlyphWalletProvider` / `useNativeGlyphConnection` / `useGlyph`로 연결과 인증을 구분하고, 공식 Glyph Portal에서 회원가입할 수 있습니다. SDK가 인증 서명을 완료하기 전에는 인증된 것으로 표시하지 않습니다.

- `user.evmWallet`, `user.linkedWallets`로 연결 상태를 확인합니다. `linkedWallets` 미제공은 미확인입니다.
- `useGlyphOwnershipCheck`를 `chainId: 1`, `includeDelegates: true`로 호출합니다. `tokens.owner`, NFT ID, 컨트랙트와 네트워크를 함께 매칭해 `linked` / `delegated`를 판정합니다.
- 지갑·NFT별 연결, 위임, 별도 위임 불필요, 미확인을 구분합니다. 직접 소유·인식된 연결 지갑 접근에는 추가 위임을 강제하지 않습니다.
- 완료된 연결·위임 CTA는 숨깁니다. 미연결 지갑은 `GlyphView.LINKED_ACCOUNTS`로 연결하고, 위임이 필요한 경우 SDK의 공식 Portal로 이동합니다. 사용자 복귀·계정 변경·자산 변경 시 다시 확인합니다.
- 인증 토큰이나 서명은 앱 자체 저장소·이벤트에 기록하지 않습니다. 계정별·자산별 조회 결과는 메모리에만 두고 이전 계정 결과는 재사용하지 않습니다. 서버에 Glyph 신원을 주장하는 클라이언트 값을 보내 권한을 부여하지 않습니다.
- 샘플 데이터·기존 수동 체크리스트는 완료 판정에 사용하지 않습니다. 외부 SDK 초기화 실패, 조회 실패, 누락 응답은 성공으로 추정하지 않습니다.
- `public/onboarding-state.js`가 순수 상태 판정 모델이며 `tests/onboarding.test.mjs`가 Wallet A/B/C, 부분 위임, 네트워크·NFT 오매칭, 로그인 전, 계정 변경, 오류를 검증합니다.

SDK 클라이언트는 `scripts/build-glyph.mjs`에서 브라우저 전용 번들 `public/glyph/`로 빌드합니다. `npm run build`와 `npm run dev:local`이 이 단계를 먼저 수행합니다. SDK는 온보딩 또는 로그인 진입 시에만 지연 로드되어 비회원 NFT 조회를 차단하지 않습니다. 실제 사용자 계정의 로그인·서명·지갑 연결·위임 실행은 해당 사용자가 공식 UI에서 진행해야 합니다.

## 근거와 이미지

- [Alchemy NFT API](https://www.alchemy.com/docs/reference/nft-api-quickstart)
- [OpenSea NFT metadata](https://docs.opensea.io/reference/get_nft)
- [OpenSea NFTs by account](https://docs.opensea.io/reference/get_nfts_by_account)
- [Glyph 공식 안내](https://www.apefest.com/faq?section=glyph)
- [Otherside](https://www.otherside.xyz/)

샘플 일러스트는 내장 imagegen으로 생성했습니다. 실제 NFT 조회에서는 API가 반환한 이미지를 사용합니다. 생성 자산은 `public/assets/hero.png`, `public/assets/collectibles.png`; 프롬프트는 `image-prompts.md`에 기록했습니다.

### NFT 가격 (ETH)
자산 카드와 상세 화면은 OpenSea의 공개 ETH 판매 등록을 우선 표시합니다. 개별 ETH 판매가가 없으면 컬렉션 바닥가를 별도 표기합니다. WETH·다른 통화를 ETH로 환산하지 않습니다. 가격은 5분 캐시하며, 공급자 오류 시 최대 1시간 이내 이전 조회값에 표시를 붙입니다. 가격이 없거나 조회에 실패하면 0 ETH로 표시하지 않습니다. 상세 화면에서 출처와 조회 시각을 확인할 수 있습니다.

`POST /api/v1/assets/prices`는 지원 컬렉션의 `{assets:[{contract,token_id}]}`를 최대 60개 받습니다. API 키는 서버에서만 사용합니다.
