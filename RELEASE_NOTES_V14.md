# Modular Agent Webapp v14 — Release Notes

## Release scope

This package is the consolidated **final source release candidate** produced after GĐ1→GĐ5 verification and GĐ6 packaging. It contains the locked production source, tests, QA scripts, provenance reports, checksum manifests, and deployment/operations/security handoff documentation.

**Official classification:** **FINAL SOURCE RELEASE CANDIDATE — WITH KNOWN ENVIRONMENT VERIFICATION LIMITATIONS**.

This is not a claim that the application is fully runtime-verified or production-deployed.

## Architecture highlights

### Agent configuration

- Canonical `AgentConfig` fields are `agentProvider`, `agentModel`, `credentialId`, `memoryEnabled`, `webSearchEnabled`, and `autoRotate`.
- Agent Chat is explicitly bounded to Google/Gemini (`agentProvider = google`).
- Model selection is propagated through the canonical configuration contract.
- The client blocks Agent send until authenticated identity and AI-settings hydration are ready.

### Search

- Web search is implemented as the custom server capability `system.web.search`.
- Search executes a separate Gemini request with Google Search grounding and returns answer text plus source metadata/search queries.
- The design avoids mixing unsupported built-in search and custom Agent tools in one incompatible model call.

### Authorization

- Firebase identity is verified on the server before protected API routes execute.
- Permission and ownership decisions are server-authoritative; client-supplied identity/role/permission fields are stripped from Agent state.
- Capability discovery and execution both re-check effective permission and module state.

### Tasks / Memory

- Tasks and Memory use the server control plane (`UserDataService`/capabilities/API), not direct browser Firestore CRUD.
- Agent-created memory is `pending`; retrieval capability only returns `approved` memory.
- Firestore client rules deny direct read/write access to these server-owned collections.

### Sessions

- Persistent Agent sessions use Firestore metadata plus an events subcollection.
- Temporary mode uses non-persistent in-memory sessions and does not appear in persistent History.
- History, edit/retry branching, session deletion, and branch-point transcript preservation are implemented server-side.
- Development fallback sessions are pinned per session; Firestore recovery does not replace an active fallback session with an empty persistent session.
- History merges persistent Firestore sessions with pinned in-memory sessions and deduplicates by session identity.
- Runner-held session state/event/timestamp is synchronized without double append.

### Capability execution / HITL

- `CapabilityExecutionService` is the central execution gateway.
- High-risk capability confirmation is server-authoritative; a caller-provided `confirmed:true` cannot bypass HITL.
- Confirmation challenges are bound to user/capability/input and consumed transactionally.

### Audit

- Audit records are stored durably in Firestore.
- Durable pre-execution audit exists before capability execution.
- Module toggle and its audit entry are staged in the same Firestore transaction.
- Audit values are sanitized/redacted and tenant filtering occurs before ordering/limit/pagination.

### Runtime hardening

- Runtime health reports `ok`, `degraded`, or `error` from real Firestore/session/module/audit component state; `error` returns HTTP 503.
- Health probes are read-only and do not change session fallback mode.
- Browser Stop propagates cancellation through HTTP/server/Agent/tool/provider paths where supported.
- Production Helmet/CSP is enabled.
- `/api/log-error` has schema validation, a 32 KB body limit, redaction, and dedicated rate limiting.
- Expensive authenticated endpoints are additionally rate-limited by verified user identity.
- Fatal unhandled rejection/uncaught exception paths redact the message and terminate non-test processes.

### Credential security

- Personal credential secrets are stored as versioned AES-256-GCM protected payloads.
- The encryption master secret is server-side only and comes from `CREDENTIAL_ENCRYPTION_KEY`.
- Legacy plaintext/pre-GĐ4D AES records migrate transactionally and fail closed if migration cannot complete.
- Credential owner/provider/status checks are enforced before outbound provider use.
- Personal auto-rotation is deterministic, same-user/same-provider, and does not silently fall back to System Key.
- Explicit provider HTTP status has precedence in rotation classification; rotation only occurs for eligible authentication/quota failures and never after streaming has started.
- Client state preserves `active` / `disabled` / `invalid` metadata but does not persist saved secrets.

## Verification summary

Release matrix carried forward from checker-accepted GĐ5 Verification Supplement:

- **59 PASS**
- **3 BLOCKED**
- **0 FAIL**

The three BLOCKED verification items remain:

1. **#17 Firestore IAM/ADC staging preflight — BLOCKED (P1).**
2. **#20 Full runtime/toolchain verification — BLOCKED (P2).** Dependency installation, full TypeScript, full Vitest/integration and production build were not successfully executed in the verification environment.
3. **#53 Firestore Rules Emulator verification — BLOCKED (P1).** Rules have static evidence only; Emulator execution was not available.

## Known limitations

- Runtime/cloud verification remains partially blocked as listed above.
- Current credential protection uses one active environment master key/key ID. There is no multi-key decryption ring; changing the master key requires controlled credential migration.
- Live deployment IAM must be verified for the service identity before relying on Admin Firestore operations.
- Firestore client rules must still be exercised with the Firebase Emulator or equivalent runtime rule test before claiming runtime Rules verification.

## Deployment prerequisites

- A Node/npm environment compatible with the locked dependency graph.
- Successful `npm ci` from `package-lock.json`.
- Firebase project configuration and Firestore database corresponding to `firebase-applet-config.json`.
- Firebase Admin Application Default Credentials (ADC) or attached service identity with appropriate Firestore/Auth access.
- `VITE_FIREBASE_API_KEY` for the browser Firebase SDK.
- `GEMINI_API_KEY` if the System Google credential will be used.
- Stable server-only `CREDENTIAL_ENCRYPTION_KEY`; optional `CREDENTIAL_ENCRYPTION_KEY_ID` identifies that key version.
- Full typecheck, Vitest/integration, production build, Rules Emulator, and IAM preflight should be completed in the target/staging environment before production deployment.

## Security notes

No API key, master encryption key, service-account JSON, private key, OAuth token, Firebase token, or production credential is intentionally included in this release package. Synthetic/placeholder values remain only in tests, QA scripts, and `.env.example` where appropriate.
