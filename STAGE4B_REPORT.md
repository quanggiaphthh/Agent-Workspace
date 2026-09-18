# STAGE4B REPORT — CENTRAL EXECUTION GATEWAY, SERVER-AUTHORITATIVE HITL, DURABLE AUDIT

Date: 2026-09-17
Scope: GĐ4B only. No GĐ4C, GĐ4D, GĐ5 or GĐ6 implementation.

## 1. Result

**GĐ4B PASS for all source-level, behavior and regression gates available in this environment.**

Dependency-based full TypeScript/Vitest/Vite verification is explicitly **BLOCKED BY NETWORK/DEPENDENCY INSTALL**: `npm ci` timed out twice and `npm ci --offline` returned `ENOTCACHED` for `@types/supertest`. No registry, dependency, model/provider architecture, Firestore Rules IAM workaround, GitHub commit or push was used.

## 2. Source provenance

The original checkpoint ZIP contained the GĐ1–GĐ4A checkpoint files but not the complete application tree needed to rerun GĐ2 (`server/core/capabilities/serverCapabilityRegistry.ts` was absent). The user then supplied `agent-webapp.zip`. The working tree was reconstructed only from these two user-provided ZIPs: full application tree from `agent-webapp.zip`, then checkpoint files overlaid from `modular-agent-webapp-v14-checkpoint-gd1-gd4a-2026-09-17.zip`. GitHub was not used as source of truth.

## 3. Files changed/added for GĐ4B

- `server/core/capabilities/CapabilityExecutionService.ts`
- `server/core/capabilities/CapabilityConfirmationService.ts` (new)
- `server/core/capabilities/CapabilityConfirmationPolicy.ts` (new)
- `server/core/capabilities/serverCapabilityRegistry.ts`
- `server/agent/adk/CapabilityToolAdapter.ts`
- `server/core/audit/auditService.ts`
- `server/core/audit/auditRedaction.ts` (new)
- `server/infrastructure/storage.ts`
- `shared/contracts/audit.ts`
- `server.ts`
- `src/agent/ui/AdkConfirmation.tsx`
- `src/modules/settings/AuditLogTab.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `scripts/qa-stage4b.mjs`
- `scripts/qa-stage4b-behavior.mjs` (new)

## 4. Central execution gateway

All production capability execution paths now converge on `CapabilityExecutionService.execute(...)`.

Canonical order is enforced as: authenticated server identity → input validation → module enabled check → permission check → HITL policy → capability execution → sanitized audit summary → durable audit finalization → response.

The REST `/api/capabilities/execute` path and ADK `CapabilityToolAdapter` both use the same gateway. Direct `ServerCapabilityRegistry.execute(...)` calls remain only inside the gateway (plus test files), so policy/audit behavior cannot diverge between REST and Agent paths.

## 5. Server-authoritative HITL

High-risk execution ignores caller-provided `confirmed` state. The gateway creates a server-side confirmation challenge with a cryptographically random UUID and binds it to:

- authenticated `userId`;
- `capabilityId`;
- SHA-256 hash of normalized input;
- expiry time.

Confirmation challenges are stored in Firestore collection `capability_confirmations`. Consumption runs inside a Firestore transaction and records `consumedAt`; mismatch, expiry and replay are rejected. A challenge cannot be reused by another user, capability or input payload. The UI/ADK confirmation response returns the server `confirmationId`; `confirmed:true` alone is insufficient.

## 6. Durable audit and redaction

Production audit persistence now uses Firebase Admin Firestore collection `audit_logs`. Legacy `auditLogs` storage was removed from local `.data/db.json` schema so local JSON is no longer an audit backend.

Audit records include identity/permission summary, capability/module/risk, outcome, duration, sanitized input/result summaries, error code/summary, session/tool/request identifiers and confirmation ID when present. Outcomes cover `success`, `denied`, `confirmation_required`, `confirmation_failed`, `execution_error` and cancellation.

Redaction recursively filters secret-bearing keys and nested structures, bearer/JWT/API-key-like values, JSON-formatted secret fields in strings, cookies/passwords/credentials, binary payloads, oversized strings, deep objects and oversized arrays/objects. Raw capability input/result payloads are not persisted.

## 7. Tenant isolation and pagination

For ordinary users, `where('userId', '==', userId)` is applied before ordering/cursor/limit. Cross-user/global audit access is granted only through the existing `audit.read` permission; no new auditor role or permission was introduced.

Audit pagination uses an opaque cursor over `timestamp + documentId`; page size is bounded but there is no application retention hard-cap such as 500 records. `firestore.indexes.json` adds the `audit_logs` `userId + timestamp` composite index. Client Firestore Rules deny direct access to both `audit_logs` and `capability_confirmations`; Admin SDK continues to rely on ADC/IAM.

## 8. QA evidence

Final regression gates:

- GĐ1: 22/22 PASS
- GĐ2: 22/22 PASS
- GĐ3A: 8/8 PASS
- GĐ3B: 9/9 PASS
- GĐ3C: 8/8 PASS
- GĐ4A: 19/19 PASS
- GĐ4B: 43/43 PASS
- GĐ4B behavior suite: 18/18 PASS

`git diff --no-index --check` against the reconstructed baseline produced no whitespace diagnostics. Exit code is 1 only because `--no-index` reports that files differ; the delivered tree has no `.git` metadata, so plain `git diff --check` is unavailable without creating repository metadata.

## 9. Blocked runtime checks

- `npm ci`: timed out twice.
- `npm ci --offline`: `ENOTCACHED` (`@types/supertest`).
- Global `tsc --noEmit`: cannot produce a valid project verdict because dependencies/types are absent; errors are dominated by unresolved packages such as Express, React, Firebase Admin and ADK.
- `npm test`: blocked because `vitest` is not installed.
- `npm run build`: blocked because `vite` is not installed.
- Firestore runtime/IAM integration was therefore not executed; no IAM result is claimed and Firestore Rules were not loosened as a workaround.

## 10. Intentionally not done

No GĐ4C health/readiness work, cancellation propagation, CSP, `/api/log-error` hardening, new per-user quota system, credential rotation, Secret Manager/KMS migration, full Firestore Emulator suite, 54-item release audit, or GĐ5/GĐ6 release work was performed.
