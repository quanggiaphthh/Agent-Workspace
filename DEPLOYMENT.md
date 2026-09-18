# Modular Agent Webapp v14 — Deployment Guide

> Status: **FINAL SOURCE RELEASE CANDIDATE — WITH KNOWN ENVIRONMENT VERIFICATION LIMITATIONS**. This guide documents how the current source is intended to be built and run; GĐ6 does not deploy it.

## Requirements

- **Node.js:** `package.json` does not declare an `engines.node` constraint. GĐ5 verification used Node `v22.16.0`; use a Node 22-compatible environment until an explicit engine policy is introduced.
- **npm:** project has `package-lock.json`; GĐ5 verification used npm `10.9.2`. Install from the lockfile with `npm ci`.
- Firebase project configuration compatible with `firebase-applet-config.json`.
- Firestore database identified by the checked-in Firebase applet config.
- Firebase Admin Application Default Credentials (ADC), supplied by an attached service identity or another supported ADC mechanism.
- A Google/Gemini System credential if `credentialId=system` will be used.
- A stable server-only credential-encryption master secret if personal credentials will be stored/resolved.

## Environment variables used by current source

Do not commit real values. The variable names below are derived from current runtime/build source.

```dotenv
# Server-only Google/Gemini System credential. Required only when System Key is used.
GEMINI_API_KEY=

# Server-only personal-credential encryption master secret. Must remain stable.
CREDENTIAL_ENCRYPTION_KEY=

# Optional identifier for the current encryption key version; defaults to env-v1.
CREDENTIAL_ENCRYPTION_KEY_ID=

# Browser Firebase Web SDK API key, provided to Vite at build/runtime injection time.
VITE_FIREBASE_API_KEY=

# Runtime mode; production enables static serving/CSP and disables dev session fallback.
NODE_ENV=production

# Optional ADC file source when not using an attached platform identity.
GOOGLE_APPLICATION_CREDENTIALS=

# Development-only Vite behavior; set true to disable HMR/file watching.
DISABLE_HMR=
```

Notes:

- `GOOGLE_APPLICATION_CREDENTIALS` is one possible ADC source. Its mere presence is not proof that ADC/IAM works; health probes perform a real read-only Firestore check.
- `firebase-applet-config.json` supplies Firebase project/database identifiers used by both Web/Admin initialization.
- `.env.example` also contains an `APP_URL` placeholder inherited from the AI Studio template, but current source does not reference `APP_URL`; it is not a required runtime variable for this source snapshot.

## Credential encryption key

`CREDENTIAL_ENCRYPTION_KEY` is a server-side master secret. Current protector requirements/semantics:

- it must be present for personal credential protection/unprotection;
- the source requires at least 32 bytes of UTF-8 master-secret material and derives the 256-bit AES key with SHA-256 for compatibility with the pre-GĐ4D format;
- AES-256-GCM uses a new 12-byte IV per protected secret and an authentication tag;
- the master key must never be exposed to the browser or stored in Firestore beside ciphertext;
- production must not fall back to plaintext if protection/decryption/migration fails;
- current design has one active master key/key ID and no multi-key decryption ring. **Do not rotate/change the production master key ad hoc.** Plan a controlled credential migration first.

## Firebase Admin / service identity

`server/lib/firebaseAdmin.ts` initializes Firebase Admin with `applicationDefault()` and the configured Firebase project/database IDs.

Before deployment, verify the backend service identity has the IAM permissions required by the application operations it performs. Do not assume a particular role from this source package; choose least-privilege roles/permissions according to the target environment and verify with a staging preflight.

**Important:** Firestore Security Rules are a browser/client boundary. Firebase Admin SDK uses IAM and bypasses client Rules. Do not loosen Security Rules to fix an Admin `PERMISSION_DENIED` error.

## Install

Use the existing lockfile; do not update dependencies during release deployment verification.

```bash
npm ci
```

GĐ5 could not complete this command because the verification environment lacked network/cache for all packages. A successful install is still required before claiming runtime release readiness.

## Verification commands

After dependencies install successfully:

```bash
npm run lint
npm test
npm run test:integration
npm run build
```

Current scripts mean:

- `npm run lint` → `tsc --noEmit`
- `npm test` → `vitest run`
- `npm run test:integration` → `vitest run src/__tests__/integration.test.ts`
- `npm run build` → Vite frontend build followed by esbuild bundling `server.ts` to `dist/server.cjs`

These commands remain **BLOCKED / not successfully verified** in the GĐ5 environment and must not be documented as PASS.

## Build

```bash
npm run build
```

Expected outputs are frontend assets in `dist/` plus bundled backend `dist/server.cjs`. GĐ6 does not include generated `dist/` because this artifact is a source snapshot and production build verification is still blocked.

## Start

After a successful build:

```bash
NODE_ENV=production npm start
```

The server listens on `0.0.0.0:3000` in current source; port is currently a source constant, not a documented environment variable.

For local development with dependencies installed:

```bash
npm run dev
```

## Health

Public endpoint:

```text
GET /api/health
```

It aggregates Firestore Admin, session persistence, module persistence, and audit persistence.

- `status: ok` → all reported components are OK.
- `status: degraded` → at least one component is degraded and none is error; HTTP status remains 200.
- `status: error` → one or more components are unavailable/error; endpoint returns HTTP 503.

The probes are read-only. A health request must not create data, migrate secrets, or switch session execution mode.

## Firestore Rules verification

Current `firestore.rules` denies direct browser read/write for server-authoritative Tasks, Memory, credentials, audit, confirmations, and the default catch-all. Static review exists, but GĐ5 did not execute the Rules in Firebase Emulator. Run real Emulator tests before claiming Rules runtime verification.

## Release verification limitations carried into this package

- **#17 Firestore IAM/ADC staging — BLOCKED.**
- **#20 Full runtime/toolchain verification — BLOCKED.**
- **#53 Firestore Rules Emulator — BLOCKED.**

Deployment should remain a separate, explicitly authorized operation after these checks are completed or consciously accepted by the deployment owner.
