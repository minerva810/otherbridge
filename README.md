# Other Bridge

가진 자산에서, 쓰이는 자산으로. `../requirements.md`를 바탕으로 만든 Yuga NFT 유틸리티 탐색·Otherside 온보딩 웹앱입니다.

## 실행

Node.js 22.13 이상이 필요합니다. 외부 npm 의존성은 없습니다.

```powershell
cd other-bridge
npm run dev
```

http://localhost:3000 에서 확인합니다. 실제 조회는 서버 환경변수 설정 후 서버를 시작하세요.

```powershell
$env:ALCHEMY_API_KEY = 'your-key'
npm run dev
```

`.env.example`은 설정 예시입니다. 서버는 `.env`를 자동으로 읽지 않습니다. 키는 클라이언트로 전달하지 않습니다.

## 제공 기능

- 반응형 Overview, My assets, Utility explorer, Onboarding, Wallets, Analytics 화면
- 복수 EVM 주소 형식 검사·중복 제거·삭제, 세션 저장, 샘플 체험과 실제 조회 구분
- Alchemy NFT API v3 기반 서버 조회: 5개 컬렉션, 페이지네이션, 정규화, 10분 캐시, 오류 시 24시간 이내 캐시와 갱신 시각 표시
- NFT 이미지·Token ID·속성·주소와 자산별 유틸리티 상세
- 데이터 기반 Registry, OWN_COLLECTION / MIN_QUANTITY / TRAIT_EXISTS 규칙
- LIVE / ANNOUNCED / PLANNED / SIMULATED / UNAVAILABLE 상태 모델과 보유 매칭·최종 자격 분리
- Glyph / Otherside 공식 이동, 사용자가 표시하는 가이드 진행률
- 세션 클릭 분석·이벤트 JSON 내보내기, 로컬 서버 사용 시 SQLite 이벤트 저장

## 배포 및 범위

Sites 배포는 `dist/` 정적 체험 버전입니다. 모든 탐색·필터·상세·체크리스트·지갑 목록·로컬 분석 기능이 작동합니다. 실제 온체인 API와 SQLite는 포함된 Node 서버를 실행할 때 동작하며, 정적 배포에서는 서버 설정이 필요하다는 오류를 표시합니다. 임의 주소에 샘플 NFT를 실제 조회 결과처럼 반환하지 않습니다.

로그인은 현재 비회원 세션입니다. Google OAuth, 계정별 동기화, 운영자 인증·대시보드, Supabase/FastAPI 인프라는 연결하지 않았습니다. 전체 요구사항의 프로덕션 구현이 아닌, 작동 가능한 웹앱 및 로컬 온체인 API 구현입니다. 지갑 서명·거래·Claim·최종 캠페인 자격 검증은 하지 않습니다.

## 데이터 관리

처음 실행하면 `.local/other-bridge.sqlite`에 users, wallets, collections, assets, utilities, utility_rules, utility_guides, events를 생성합니다. `users`는 향후 OAuth 연동을 위한 스키마이며 현재 인증 기능이 아닙니다. Registry의 초기 데이터는 `dist/registry.json`입니다. 초기 실행 이후 운영자는 SQLite의 `utilities.data`, `utility_rules.data`, `utility_guides.data` JSON을 수정할 수 있으며 로컬 `/registry.json`과 API에 반영됩니다. SQLite 파일은 공개 정적 경로 밖에 있고 Git에서 제외됩니다.

정적 배포의 Registry는 `dist/registry.json`을 수정해 재배포합니다. DB 업데이트는 정적 배포에 자동 동기화되지 않습니다.

## API

| Method | Endpoint | 설명 |
|---|---|---|
| GET | /api/v1/health | API 준비 상태, 키 값은 노출하지 않음 |
| POST | /api/v1/portfolio/resolve | `{ "wallets": ["0x…"] }` |
| GET | /api/v1/assets/:id | NFT 상세 및 관련 Utility |
| GET | /api/v1/utilities/:id | Registry 항목 |
| POST | /api/v1/utilities/match | `{ "assets": [...] }` 규칙 매칭 |
| POST | /api/v1/events | 허용된 서비스 이벤트 저장 |

비회원 세션 데이터는 `sessionStorage`를 사용합니다. 로컬 서버의 NFT 캐시·이벤트는 SQLite에 보관됩니다. 관리 분석 UI는 현재 브라우저 세션의 이벤트만 표시하며 전체 사용자 지표로 표현하지 않습니다. 공식 링크 클릭은 게임 접속·플레이를 증명하지 않습니다.

## 콘텐츠 근거

- Glyph 계정·지갑 시스템: https://www.apefest.com/faq?section=glyph (2026-11-05 검토)
- Otherside 공식 경로: https://www.otherside.xyz/
- Alchemy NFT API: https://www.alchemy.com/docs/reference/nft-api-quickstart
- Glyph 온보딩 이외의 Utility는 최신 운영 상태를 확인하지 못해 `SIMULATED`로 표시합니다. 공식 발표를 확인하지 못한 기능에 `ANNOUNCED`, `PLANNED`, `LIVE`를 임의 부여하지 않습니다.
- 샘플 NFT 보유 정보·지갑·속성과 일러스트는 예시이며 실제 NFT와 대응하지 않습니다.

## 검증

```powershell
npm run check
```

실제 API 키 없이는 Alchemy의 실 응답이나 보유 결과를 검증할 수 없습니다.

## 이미지

`dist/assets/hero.png`, `dist/assets/collectibles.png`는 내장 imagegen으로 생성한 프로젝트용 이미지입니다. 최종 프롬프트는 `image-prompts.md`에 기록했습니다. 일러스트는 실제 컬렉션 NFT 이미지를 뜻하지 않습니다.
