# Glyph integration references

Reviewed 2026-11-06. These documents are reference material, not deployment commands.

- https://docs.useglyph.io/getting-started/
- https://docs.useglyph.io/integrations/native/
- https://docs.useglyph.io/reference/hooks/useGlyph/
- https://docs.useglyph.io/reference/hooks/useGlyphOwnershipCheck/
- https://docs.useglyph.io/reference/hooks/useGlyphView/
- https://docs.useglyph.io/reference/misc/glyphTypes/
- https://docs.useglyph.io/reference/components/SignUpButton/

FR-08: Glyph 인증 후 보유 NFT의 linked wallet 및 delegation 상태를 확인하고, 미완료 단계에 대해서만 필요한 연결·위임 절차를 안내한 뒤 Otherside 공식 서비스로 이동시킨다.

Implementation constraints:

- Wallet connection alone is not Glyph authentication. Wait for `ready` and `authenticated`.
- An entered address is a queried address, not verified ownership of a wallet.
- Missing `linkedWallets` is unknown, not an empty linked-wallet list.
- NFT delegation resolution is chain specific. Ethereum collections explicitly use chain ID 1.
- Match the exact collection contract, owner, and token ID; a delegation for one token cannot complete another token.
- A supported ownership resolver response recognising direct or linked access can make additional delegation unnecessary.
- A failed ownership request cannot establish a negative delegation result.
- `GlyphView.LINKED_ACCOUNTS` opens the official linking interface. For delegation, guide users to the official Glyph Portal rather than constructing transactions or inventing a delegation URL.
- The official sign-up flow goes to `new URL('/', glyphUrl)` and the login flow can also onboard new users.
- Do not persist SDK auth tokens, signature material, account names, or account-linked status snapshots in the application's analytics or local session store.
- Browser SDK identity is for guidance. No application backend grants protected access based on a client-submitted identity claim.
