# Stage 4D Report

## Scope

**GĐ4D – Credential & Secret Lifecycle Hardening**

This stage is limited to credential/secret lifecycle security and the directly affected API/provider/search/client boundaries. GĐ5 and GĐ6 are not implemented.

## Input checkpoint

- Input ZIP: `modular-agent-webapp-v14-stage4c-runtime-hardening.zip`
- Checker-approved input SHA-256: `66546810bd58bc47ea34828667a67cc7849f7898da4062f359a594ff4027ab0f`
- SHA-256 verification before modification: **MATCH**
- Source of truth: the input ZIP only. GitHub was not used.

### Checker correction input

- Correction source ZIP: `modular-agent-webapp-v14-stage4d-credential-security.zip`
- Checker-verified correction-input SHA-256: `4b3b15e52e4f13abed304bd9f9c977f04ee7d236989f2dc2c00b0ff290982e77`
- Correction scope: failure-classifier HTTP-status precedence and client preservation of `disabled`/`invalid` credential status only.

## Architecture

### Credential secret protector/backend

Personal credential secrets are protected exclusively on the server through `CredentialSecretProtector`. The production implementation for this checkpoint is `EnvAesGcmCredentialSecretProtector`, using Node crypto with AES-256-GCM and a server-only master secret from `CREDENTIAL_ENCRYPTION_KEY`.

There is no plaintext or insecure production fallback. Missing/invalid protector configuration fails closed with `CREDENTIAL_SECRET_BACKEND_UNAVAILABLE`. `CREDENTIAL_ENCRYPTION_KEY_ID` is configuration metadata only; the encryption key itself is never stored with credential documents.

Protected payload format is versioned:

- `version: 1`
- `algorithm: "aes-256-gcm"`
- `keyId`
- `ciphertext`
- `iv` — fresh 12-byte random IV per encryption
- `authTag`

The protector validates the configured master-secret length, derives exactly 256 bits for AES-256 and requires authenticated decryption. Ciphertext tampering, the wrong key or incompatible protected format fails closed.

### Legacy migration

Legacy records are supported only through controlled migration:

1. transactionally re-read the credential under the authenticated user's collection;
2. protect a legacy plaintext `key`, or decrypt the pre-GĐ4D flat AES-GCM fields and re-protect them into the versioned payload;
3. transactionally write the versioned protected payload;
4. delete plaintext `key` and old flat crypto fields;
5. only continue secret use after migration commits successfully.

Migration failure returns `CREDENTIAL_MIGRATION_FAILED`; plaintext is not used as a fallback. Concurrent migration is transaction-safe. `listCredentials()` also migrates encountered legacy secret material before returning metadata so normal credential listing does not leave a known plaintext legacy record untouched.

### System credential boundary

`credentialId === "system"` resolves only the server-side Google/Gemini system credential from `GEMINI_API_KEY`. A system credential is never persisted in a user's credential collection, never returned by credential metadata APIs and is rejected for non-Google providers.

A personal credential missing/provider-mismatched/inactive state fails closed. Personal selection never silently falls back to the System Key.

### Rotation policy

Auto-rotation is server-side and tenant/provider scoped:

- explicit System selection uses only System;
- personal selection rotates only among active personal credentials owned by the same user and provider;
- selected personal credential is tried first;
- remaining candidates use durable `priority`, then `createdAt`, then `id` as a deterministic final tie-break;
- disabled/invalid records are excluded;
- explicit HTTP status has precedence over conflicting provider message text;
- only authentication (401) or quota/rate-limit failures may rotate;
- authorization/scope failures (403), transient 5xx/network, malformed request and model errors do not rotate;
- no rotation is allowed after any response has already been yielded;
- mutating tool execution is not replayed merely because a provider credential changes.

When an eligible rotation pool is exhausted before streaming, Agent chat preserves the safe `NO_ROTATION_CANDIDATE` code/status without leaking provider or credential material.

## Changes

### A. Protected personal credential storage

- Added `server/core/ai/credentialSecretProtector.ts`.
- Removed normal plaintext personal credential writes.
- Added versioned AES-256-GCM protected records.
- Added fail-closed secret-backend and decrypt error semantics.
- Added server-side create/update/delete lifecycle with no secret in save/update responses.

### B. Legacy migration and concurrency

- Added transaction-based lazy migration for plaintext and pre-GĐ4D encrypted records.
- Plaintext/legacy fields are deleted after a successful migration.
- Migration failure does not continue with plaintext.
- Metadata listing migrates encountered legacy secret material before returning.
- Reorder remains transaction-scoped to authenticated user + provider.

### C. Provider/ownership boundary

- Credential resolution verifies user ownership, requested provider and active state before outbound provider use.
- Model list/test and Search resolve stored credentials server-side.
- Stored credentials are not sent back to the client for model testing.

### D. Auto-rotation correctness

- Added `server/core/ai/credentialRotationPolicy.ts`.
- Personal-only rotation prevents silent System billing/quota crossover.
- Rotation failure classes distinguish authentication, quota, transient, malformed and model errors.
- Rotation is blocked after partial streaming.
- Candidate ordering is deterministic even if durable priority/timestamp values tie.

### E. Redaction and failure semantics

- Provider diagnostics sanitize error text before logging.
- Provider test diagnostics never bind a tested API key to the diagnostic `modelId` field.
- Known secret values are explicitly stripped from provider error messages.
- AI credential/model routes use bounded safe error messages and safe uppercase error codes only.
- Agent chat preserves safe provider/rotation failure code/status only before response headers are sent.
- Web Search converts provider failures to safe classified errors while preserving cancellation semantics.
- Existing durable audit redaction remains unchanged and continues to sanitize credential/secret-bearing fields.

### F. Client state and API contract

- Credential list state stores metadata only; API keys are transient component input state and excluded from Zustand persistence.
- Client metadata preserves server lifecycle status (`active` / `disabled` / `invalid`) instead of coercing every credential to `active`.
- Save responses return only credential ID; list responses contain metadata only.
- Deleting a selected personal credential no longer silently rewrites Agent configuration to System.
- Agent configuration no longer defaults an omitted personal selection to System.
- UI rotation copy now states personal-only, same-provider auth/quota semantics and no silent System fallback.

### G. Source secret hygiene

- Removed the pre-existing hard-coded Firebase web API-key value from `firebase-applet-config.json`.
- Firebase Web SDK now obtains that deployment value from `VITE_FIREBASE_API_KEY`.
- Firebase Admin remains ADC/service-identity based; no service-account JSON is introduced.
- `.env.example` contains placeholders/instructions only, not live keys.

## Fresh QA

`Fresh` means executed against the GĐ4D worktree after the relevant GĐ4D changes. A gate was not rerun again after later changes when those later changes did not affect that gate's scope.

| Gate | Result | Evidence |
|---|---:|---|
| Input checkpoint SHA-256 | MATCH | Fresh before modification |
| GĐ1 `node scripts/qa-stage1.mjs` | **22/22 PASS** | Fresh final after credential/Firebase client changes |
| GĐ2 `node scripts/qa-stage2.mjs` | **22/22 PASS** | **Fresh final** after shared failure-classifier precedence correction used by Search |
| GĐ4C `node scripts/qa-stage4c.mjs` | **42/42 PASS** | Fresh earlier in GĐ4D; not rerun after narrow checker correction because no GĐ4C runtime/session source changed |
| GĐ4C behavior | **12/12 PASS** | Invoked by fresh GĐ4C gate |
| GĐ4C session integration | **5/5 PASS** | Invoked by fresh GĐ4C gate |
| GĐ4D `node scripts/qa-stage4d.mjs` | **40/40 PASS** | **Fresh final** aggregate gate after checker corrections |
| GĐ4D protector/rotation behavior | **21/21 PASS** | **Fresh final**, including conflicting status/message precedence and client disabled/invalid status preservation |
| GĐ4D credential lifecycle integration | **17/17 PASS** | Invoked by final GĐ4D gate; real `CredentialService` source with isolated Firestore stub |

### GĐ4D behavior coverage

Behavior/integration evidence includes:

- create stores no plaintext secret;
- versioned AES-256-GCM round-trip;
- tamper and wrong-key failure;
- missing protector configuration fail-closed;
- plaintext and pre-GĐ4D AES migration;
- migration failure fail-closed;
- concurrent migration consistency;
- metadata list migration of legacy plaintext;
- metadata-only list/save contract;
- update protected secret replacement;
- cross-user/provider rejection;
- deterministic reorder/rotation priority, including tie-break;
- disabled credential exclusion;
- explicit System selection isolation;
- no personal-to-System rotation;
- no rotation after partial stream;
- non-retryable/transient provider errors do not rotate;
- explicit 403/429/5xx status overrides misleading message heuristics;
- client preserves `disabled` and `invalid` metadata status from the server;
- audit/log secret redaction invariants.

### Checker-correction RED → GREEN evidence

- Before production correction, GĐ4D behavior was **16/21**: three conflicting status/message cases and two client status-preservation cases failed.
- Aggregate GĐ4D gate was **38/40** before correction.
- After correction, behavior is **21/21** and aggregate GĐ4D is **40/40**.

## Inherited QA

The following gates were not rerun because GĐ4D did not change their architecture/source area. Their status is inherited from the checker-approved GĐ4C checkpoint and is not represented as fresh execution evidence.

| Gate | Inherited result |
|---|---:|
| GĐ3A | 8/8 PASS |
| GĐ3B | 9/9 PASS |
| GĐ3C | 8/8 PASS |
| GĐ4A | 19/19 PASS |
| GĐ4B | 43/43 PASS |
| GĐ4B behavior | 18/18 PASS |

## Blocked checks

### Dependency install

- `npm ci`: final verification attempt timed out; dependencies were not installed.
- `npm ci --offline`: **ENOTCACHED** for `@types/supertest`.
- Registry/dependencies/versions were not changed to work around the environment.

### TypeScript / tests / production build

- `npm run lint` (`tsc --noEmit`): **BLOCKED BY NETWORK / DEPENDENCY INSTALL**. Output is dominated by missing installed modules/type declarations; no PASS is claimed.
- `npm test`: **BLOCKED BY NETWORK / DEPENDENCY INSTALL** — `vitest: not found`.
- `npm run build`: **BLOCKED BY NETWORK / DEPENDENCY INSTALL** — `vite: not found`.

### Live cloud integration

- Live Firestore migration/IAM execution: **NOT EXECUTED / NOT CLAIMED**.
- Google Cloud KMS / Secret Manager integration: **NOT IMPLEMENTED in this design**; no live KMS/Secret Manager PASS is claimed.

## Known limitations

1. This checkpoint uses a server-managed environment master secret rather than Cloud KMS/Secret Manager. Production deployment must provision a stable, high-entropy `CREDENTIAL_ENCRYPTION_KEY` outside source control.
2. `CREDENTIAL_ENCRYPTION_KEY_ID` is used to bind protected payloads to the configured key version. This checkpoint does not implement a multi-key decryption ring or automatic master-key rotation; changing the master key/key ID requires a controlled migration strategy.
3. Legacy plaintext migration is lazy/transactional. Credentials encountered through metadata listing or credential resolution are migrated; no destructive bulk migration job was introduced.
4. Full TypeScript/unit/build verification remains blocked by the dependency-install environment. Therefore this is not a whole-project release-ready claim.

## Out of scope / not performed

- GĐ5: **not performed**.
- GĐ6: **not performed**.
- No new Agent provider implementation (OpenAI/Anthropic/NVIDIA remain outside RootAgent).
- No file upload subsystem.
- No UI redesign.
- No billing/subscription or new quota/cost-accounting system.
- No Search, Session or Module architecture redesign.
