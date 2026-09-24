# Agent-Workspace — Deployment & Operations Guide

> Current product: private **single-user personal app**.  
> W10 integrated Firebase/Gemini acceptance: **PASS**.  
> W11 security/operations hardening checkpoint: `bfd417d3d9d90f2bb7a9ca41998801c52a27aefe`; canonical Actions run #91 (`36010878105`) **SUCCESS**.

## 1. Runtime baseline

- Node.js 22.
- Install only from the committed lockfile with `npm ci`.
- Build with `npm run build`.
- Start the built server with `NODE_ENV=production npm start`.
- Firebase Admin uses Application Default Credentials (ADC); do not embed service-account JSON in source.
- Firestore uses the named database declared in `firebase-applet-config.json`.
- File bytes are accessed by the backend through Firebase Admin Storage only.

## 2. Required production configuration

Do not commit real secret values.

```dotenv
NODE_ENV=production

# Mandatory single-owner binding. Use the Firebase Auth UID of the only
# account allowed to use this private deployment.
OWNER_UID=

# Required only when the System Gemini credential is used.
GEMINI_API_KEY=

# Required for storing/resolving personal credentials. Keep stable.
CREDENTIAL_ENCRYPTION_KEY=
CREDENTIAL_ENCRYPTION_KEY_ID=env-v1

# Public Firebase Web SDK configuration supplied at build/deploy time.
VITE_FIREBASE_API_KEY=

# Optional only when ADC is supplied through a credential file rather than
# the hosting platform service identity.
GOOGLE_APPLICATION_CREDENTIALS=
```

### OWNER_UID release gate

Production identity resolution is fail-closed:

- missing/invalid Firebase bearer token → rejected;
- `NODE_ENV=production` and missing `OWNER_UID` → authenticated application APIs reject with `OWNER_NOT_CONFIGURED`;
- valid Firebase identity whose UID differs from `OWNER_UID` → rejected with `OWNER_MISMATCH`;
- browser-provided roles/permissions never override the verified server identity.

W12 must configure and verify the real owner UID before production release.

## 3. Credential protection

Personal AI credentials are protected server-side with AES-256-GCM through `CREDENTIAL_ENCRYPTION_KEY`.

Operational rules:

- use at least 32 bytes of stable random master-secret material;
- never expose the master key or plaintext credentials to the browser;
- do not change `CREDENTIAL_ENCRYPTION_KEY` ad hoc: existing ciphertext depends on it;
- change `CREDENTIAL_ENCRYPTION_KEY_ID` only as part of a controlled migration;
- protection/decryption failure must remain fail-closed; never add plaintext fallback.

## 4. Firebase Rules

Canonical configuration is in `firebase.json`.

### Firestore

`firestore.rules` denies direct browser read/write for all server-authoritative application data and ends with a deny-all catch-all. Firebase Admin uses IAM and bypasses client Security Rules.

### Storage

`storage.rules` denies all direct browser read/write. Browser file operations must continue through authenticated application endpoints (`/api/files`); the backend uses Firebase Admin Storage.

Do not loosen Firestore or Storage Rules to work around an Admin/IAM error. Fix the backend service identity/IAM configuration instead.

W12 must deploy both rulesets to the intended Firebase project and verify that direct client access is denied while the authenticated application upload/read flow still works.

## 5. Security controls already in source

- Firebase ID-token verification before protected APIs.
- Production single-owner UID binding.
- Server-authoritative permissions and module availability checks.
- Server-authoritative HITL confirmation for protected mutations.
- Helmet production security headers/CSP.
- Global API rate limiting plus tighter public telemetry and expensive AI/Agent limits.
- 1 MiB authenticated JSON request bound and bounded file upload/read policies.
- File MIME/signature validation; ZIP archives are not accepted by the application file-ingestion path.
- Recursive audit/error redaction for bearer/JWT/API-key/credential/secret/password/cookie-like material.
- Read-only runtime health aggregation for Firestore, sessions, module persistence and audit persistence.
- Fatal unhandled rejection/exception handling in non-test runtime.

## 6. Dependency security policy

CI runs `scripts/security-audit.mjs` after `npm ci`.

Current locked ADK is `@google/adk@2.1.0`. Its dependency graph includes `adm-zip@0.5.18`, which is covered by known high-severity ZIP-processing advisories. The current Agent-Workspace runtime:

- does not accept ZIP files through its file-ingestion policy;
- does not enable an ADK skills loader in `RootAgent`;
- therefore does not expose the reviewed vulnerable ZIP-processing path through the current application surface.

A **temporary, narrow exception** is allowed only for these advisories:

- GHSA-xcpc-8h2w-3j85
- GHSA-vwc7-r8mq-g2x9
- GHSA-7q85-xj36-vmfc

The exception is pinned to `@google/adk@2.1.0` + `adm-zip@0.5.18` and expires after **2026-10-31**. Any new high/critical advisory, changed reviewed versions, changed dependency path, or expiry fails CI.

Do **not** run `npm audit fix --force`: current npm remediation proposes a breaking ADK downgrade and would reopen the locked Agent runtime. Re-evaluate the exception when an upstream-compatible fix is available.

Moderate transitive advisories remain visible in npm audit output and should be reviewed during dependency maintenance, but W11 does not force a breaking dependency change solely to eliminate them.

## 7. Verification before release

Canonical static gate:

```bash
npm ci
node scripts/security-audit.mjs
npm run lint
npm test
node scripts/qa-w11-security.mjs
npm run build
sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256
```

The GitHub Actions workflow also executes the historical targeted and QA regression stages.

Production/live release verification belongs to W12 and must additionally prove:

1. `OWNER_UID` matches the actual signed-in owner;
2. a different valid Firebase identity is denied;
3. Firestore direct client access is denied;
4. Storage direct client access is denied;
5. authenticated app upload/attachment/Gemini still works;
6. `/api/health` reports expected persistent components;
7. persistent/temporary chat, Task create/update HITL, cancellation and module disable/re-enable remain correct.

## 8. Rate/quota and provider failures

Gemini is the only primary Agent provider in the MVP UI. Provider/quota/credential failures must remain recoverable application errors, not process crashes. Credential rotation may happen only before streaming has started; after partial output the current run must fail rather than replaying tool/model effects.

Do not increase rate limits merely to hide quota errors. For the free-tier personal deployment, prefer clear recoverable errors and retry later.

## 9. Backup and rollback

The MVP intentionally has no second persistence system and no custom backup service.

Before any future destructive migration or bulk deletion:

- create an environment-supported Firestore/Storage backup/export when available;
- otherwise do not perform the destructive migration until a verified backup path exists.

For W12 release:

- record the exact deployed Git commit;
- record the previous known-good deployed commit;
- source rollback means redeploying the previous commit and its matching Firebase Rules;
- source rollback does **not** revert Firestore/Storage data;
- never roll back/change `CREDENTIAL_ENCRYPTION_KEY` independently of encrypted credential data.

Current W11 introduces no destructive schema migration, so rollback does not require a data transformation.

## 10. Release boundary

W11 is source/config hardening. W12 is the only workstream authorized to perform final production deployment/UAT and declare **MVP FINAL PASS / LOCKED**.
