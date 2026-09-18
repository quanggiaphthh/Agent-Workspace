# Modular Agent Webapp v14 — Changelog

This changelog summarizes the implemented/verified v14 progression. It intentionally avoids features not present in source.

## GĐ1 — Config / Credential / Permission

- Standardized canonical Agent configuration (`agentProvider`, `agentModel`, `credentialId`, `memoryEnabled`, `webSearchEnabled`, `autoRotate`).
- Locked Agent Chat provider boundary to Google/Gemini.
- Enforced personal credential missing/provider mismatch fail-closed behavior without silent System Key fallback.
- Hardened server-authoritative identity/permission handling and AI-settings hydration before Agent send.

## GĐ2 — Search / Tool / Memory

- Implemented `system.web.search` as a custom server capability with grounded source metadata.
- Preserved Gemini search/tool compatibility by using a separate search request path.
- Moved Tasks/Memory to server control-plane operations rather than direct browser Firestore CRUD.
- Added Memory approval semantics: Agent-created memory pending; retrieval approved-only with query/category semantics.

## GĐ3 — Sessions / History / Branching

- Implemented Firestore session metadata + events-subcollection persistence.
- Added persistent History APIs and removed mock-history behavior.
- Added temporary non-persistent mode.
- Added edit/retry branch semantics that preserve prior transcript at branch point.
- Added session ID validation and user-scoped server IDs.
- Hardened fallback pinning/recovery, hybrid Firestore+memory History, Runner-held session synchronization, and no-double-append behavior.

## GĐ4A — Modules / Permissions

- Unified client/server module control-plane semantics for the Tasks module.
- Applied module enabled/disabled state to capability discovery and execution.
- Tightened route/sidebar/UI permission consistency and shared permission naming.

## GĐ4B — Execution Gateway / HITL / Audit

- Centralized capability execution through `CapabilityExecutionService`.
- Replaced client-trusted confirmation with server-authoritative HITL challenge/consume flow.
- Added durable Firestore audit pre-write/finalization, redaction, tenant filtering, cursor pagination, and confirmation metadata.

## GĐ4C — Runtime Hardening

- Added component-based runtime health/readiness and accurate ADC diagnostics.
- Added fatal unhandled-error process exit behavior.
- Propagated cancellation from browser to server/Agent/tools/provider paths.
- Enabled production CSP/Helmet hardening.
- Hardened `/api/log-error` schema/size/redaction/rate limiting and added verified-user limiting for expensive endpoints.
- Removed fake attachment affordance.
- Replaced local durable module settings with Firestore; added read-through freshness and atomic module-toggle+audit.
- Hardened session fallback visibility/recovery continuity and hybrid History.

## GĐ4D — Credential Security

- Introduced versioned AES-256-GCM credential-secret protection.
- Added transaction-protected legacy plaintext/pre-GĐ4D AES migration with fail-closed semantics.
- Separated metadata from secret material and preserved server-only System credential boundary.
- Hardened owner/provider/status checks, deterministic personal-only rotation, HTTP-status precedence, and no rotation after partial streaming.
- Preserved `active` / `disabled` / `invalid` lifecycle state in the client without persisting secrets.

## GĐ5 — Verification

- Re-ran dependency-independent stage QA/behavior/integration gates and completed static security/error/concurrency review.
- Built the 62-issue release matrix.
- Recorded runtime/toolchain, Rules Emulator, and IAM/ADC gaps as BLOCKED rather than PASS.
- Verification Supplement strengthened three legacy integration tests without changing production source.
- Checker accepted the Supplement scope while retaining three verification blockers.

## GĐ6 — Packaging / Documentation / Handoff

- No production source feature/refactor changes.
- Added production source manifest, final architecture/deployment/operations/security documentation, final matrix/status, release notes, and handoff report.
- Packaged a final source release candidate while carrying forward the three BLOCKED verification items unchanged.
