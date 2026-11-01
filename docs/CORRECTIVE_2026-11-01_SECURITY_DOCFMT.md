# Security + Document Formatting bounded corrective — 2026-11-01

## Status and provenance

- Baseline main HEAD at audit: `7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1` (2026-10-14).
- Working branch: `corrective/security-docfmt-20261101`. This is an isolated proposal; **NOT a release approval**.
- Historical canonical CI: run [#229](https://github.com/quanggiaphthh/Agent-Workspace/actions/runs/38536398811), 561/561 Vitest, 15/15 W11 security QA, build PASS on 2026-10-14.
- No new Vitest, dependency audit, production build, Word visual QA or live smoke has been executed as part of this corrective; historical PASS does not transfer automatically.
- Existing MVP/R1/R2/H1–H5 remain FINAL PASS / LOCKED. No R3 opened.

## A. Source audit

- `server.ts`: authenticated `GET /api/test/firebase-connection` previously registered in production; handler writes/reads/deletes `_server_probe`.
- `src/modules/document-formatting/DocumentFormattingModule.tsx`: stale request catch/finally could update a newer operation; confirmed manual apply output was not checked against the server SHA-256; automatic flow already checked SHA.
- `server/modules/document-formatting/localDocumentProcessor.ts`: verified per-request binary hashes on the server; existing local DOCX worker and bounded package engine are the sole processing authority.
- `src/__tests__/integration.test.ts`: already tests owner auth, request-scoped DOCX handling, no durable DOCX file storage, confirmation, idempotency and replay. Reused instead of building a second test harness.
- `src/modules/document-formatting/__tests__/DocumentFormattingModule.test.tsx`: two baseline UI tests, now extended.
- `scripts/security-audit-policy.mjs` and `scripts/security-audit.mjs`: strict gRPC temporary exception expires at **2026-10-31T23:59:59Z**. Current lock pins nested `@grpc/grpc-js@1.9.16` under Firestore.
- `AGENTS.md` and `docs/MVP_IMPLEMENTATION_TRACKER.md`: forbid recreating authorities or reopening LOCKED work without evidence.

## B. Reuse audit / new code necessity

1. Reuse existing authentication, owner-only gate, Firestore authority and JSON API fallback. Add only a production early return to the diagnostic handler.
2. Reuse the existing per-component AbortController and `busy` state. Add request-identity guards; no state framework or additional runtime.
3. Reuse existing automatic output SHA-256 validation by extracting a shared local function, applying to the manual confirmed download.
4. Reuse existing API integration and UI test files; add only missing corrective scenarios.
5. Keep the DOCX worker, XML processing, capability registry, HITL/idempotency authorities and existing file storage APIs unchanged.

## C. Implemented isolated changes

- `server.ts`: production route returns a JSON 404 before creating diagnostic metadata or touching Firestore.
- `DocumentFormattingModule.tsx`: cancel/replace invalidates the previous request; stale requests cannot overwrite current state, including error and busy; automatic and manually confirmed DOCX outputs now require matching SHA-256 before download.
- `DocumentFormattingModule.tsx`: results explicitly say narrow scope does not certify whole-document ND30/HD05 compliance.
- `src/__tests__/integration.test.ts`: regression expectation that a production owner request to the diagnostic route responds 404 and does not read the `_server_probe` collection.
- `src/modules/document-formatting/__tests__/DocumentFormattingModule.test.tsx`: late cancelled automatic result, automatic digest mismatch, confirmed download digest mismatch, plus retained idempotency path with a real expected digest.

## D. Security research and release blocker

The upstream [Firebase issue #10400](https://github.com/firebase/firebase-js-sdk/issues/10400), opened 2026-09-23, records `@firebase/firestore` pinning `@grpc/grpc-js: ~1.9.0`. Firebase 13.1.0's Firestore package manifest still declares that same range. The [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) advisory affects the nested 1.9.16 copy. The reported exploit configuration involves gRPC server TLS client-certificate authentication; source audit has not shown the browser Firestore usage to expose that configuration, **but that is not a general finding of safety**.

**BLOCKED / NO-GO for production release:** The old exception is expired. Do not unconditionally extend it, disable the security audit, or force a cross-major-version gRPC override outside the parent package's declared version range. Review any upstream compatible change and rerun full dependency verification. A fresh, explicitly authorized, expiry-bound risk decision would require separate documented security sign-off. None has been made in this workstream.

## E. Minimal verification / release gates

| Gate | Required verification | Current state |
| --- | --- | --- |
| S1 | `npx vitest run src/__tests__/integration.test.ts` including production route test | NOT RUN |
| D1 | `npx vitest run src/modules/document-formatting/__tests__/DocumentFormattingModule.test.tsx` | NOT RUN |
| D2 | Existing `server/modules/document-formatting/docxPackage.test.mjs` behavior unchanged | HISTORICAL PASS / NOT RE-RUN |
| B1 | `npm run lint && npm run build` | NOT RUN |
| SEC | `node scripts/security-audit.mjs`, no expired/unreviewed high findings | BLOCKED by known upstream nested gRPC advisory |
| DOCX | Open representative Vietnamese DOCX results in Word, compare text, formatting changes, tables/images and pagination; do not claim full ND30/HD05 | NOT RUN |
| RELEASE | Canonical GitHub Actions CI on final reviewed revision | NOT RUN |
| DATA | Confirm request-scoped DOCX not persisted in Firestore/Storage using existing integration tests | HISTORICAL PASS / needs targeted rerun |

All code modifications are limited to the candidate branch until tests, blocker disposition, independent review and explicit production release decision. Do not merge into main or deploy while the security gate is blocked.

## F. Rollback

Revert isolated corrective commits on the branch, or return to baseline `7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1`. No schema migrations, new dependencies, durable-content writes or production changes were introduced.
