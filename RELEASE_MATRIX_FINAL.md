# Release Matrix Final — Modular Agent Webapp v14

This matrix is carried forward from the checker-accepted GĐ5 Verification Supplement. GĐ6 performs packaging/documentation only and adds no new runtime evidence; therefore statuses are not upgraded in GĐ6.

**Summary:** 59 PASS / 3 BLOCKED / 0 FAIL / 0 OUT OF SCOPE

**Blocked release-verification items:**

- **#17 Firestore IAM/ADC staging — BLOCKED (P1):** no live/staging ADC/service-identity preflight evidence.
- **#20 Full runtime toolchain verification — BLOCKED (P2):** dependency installation, full TypeScript, full Vitest/integration and production build remain unverified because the verification environment could not install dependencies.
- **#53 Firestore Rules Emulator realism — BLOCKED (P1):** rules were statically inspected but not executed in Firebase Emulator.

| # | Issue | Severity | Fix location | Verification | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Settings model mapping | P1 | `shared/contracts/ai.ts; src/agent/ui/AdkRuntimeProvider.tsx` | qa-stage1 22/22; canonical agentProvider/agentModel | **PASS** |
| 2 | Gemini Search + custom tool compatibility | P1 | `server/core/search/WebSearchService.ts; RootAgent.ts` | qa-stage2 22/22; custom system.web.search only | **PASS** |
| 3 | webSearchEnabled | P1 | `shared/contracts/ai.ts; RootAgent.ts; WebSearchService.ts` | qa-stage1/2; schema + runtime filter + service guard | **PASS** |
| 4 | Permission regression | P0 | `identityProvider.ts; permissionResolver.ts` | qa-stage1; qa-stage4a | **PASS** |
| 5 | Agent provider boundary | P1 | `shared/contracts/ai.ts; RootAgent.ts` | qa-stage1; Google literal schema | **PASS** |
| 6 | System Key boundary | P1 | `CredentialService.ts` | qa-stage1; qa-stage4d integration | **PASS** |
| 7 | Default model single source | P2 | `shared/contracts/ai.ts; aiKeysStore.ts; AgentAIManagerTab.tsx` | effective default derives from DEFAULT_AGENT_MODEL; duplicated option literal is catalog display, RootAgent fallback unreachable on empty pool | **PASS** |
| 8 | AI settings hydration race | P1 | `aiKeysStore.ts; FirebaseAuthProvider.tsx; AdkRuntimeProvider.tsx` | qa-stage1 hydration checks | **PASS** |
| 9 | credentialId reset | P1 | `aiKeysStore.ts` | qa-stage1; delete does not silently reset to system | **PASS** |
| 10 | AIConfig validation | P1 | `shared/contracts/ai.ts; server.ts` | qa-stage1 strict schema and server boundary parse | **PASS** |
| 11 | Tasks module state | P1 | `moduleCatalog.ts; storage.ts; serverCapabilityRegistry.ts` | qa-stage4a 19/19 | **PASS** |
| 12 | Search citations | P1 | `WebSearchService.ts; AdkRuntimeProvider/UI` | qa-stage2 source mapping/rendering | **PASS** |
| 13 | Capability discovery permission | P0 | `serverCapabilityRegistry.ts; permissionResolver.ts` | qa-stage2/4a | **PASS** |
| 14 | Edit conversation context | P1 | `AdkRuntimeProvider.tsx; server session branch route` | qa-stage3c 8/8 | **PASS** |
| 15 | Retry context | P1 | `AdkRuntimeProvider.tsx; branch route` | qa-stage3c | **PASS** |
| 16 | Temporary mode | P1 | `AdkRuntimeProvider.tsx; server.ts` | qa-stage3a/3c; stage5 static persistence guard | **PASS** |
| 17 | Firestore IAM | P1 | `server/lib/firebaseAdmin.ts; cloud environment` | gcloud unavailable; ADC env absent; live IAM probe not executed | **BLOCKED** |
| 18 | Session fallback visibility | P1 | `FirestoreSessionService.ts; runtimeHealthPolicy.ts` | qa-stage4c 42/42; behavior 12/12 | **PASS** |
| 19 | Fake client admin identity | P0 | `contextStore.ts; identityProvider.ts` | qa-stage1 | **PASS** |
| 20 | Test coverage gaps | P2 | `src/__tests__/*` | legacy gaps corrected in source, but full Vitest remains unavailable | **BLOCKED** |
| 21 | Dual Tasks/Memory auth planes | P1 | `UserDataService.ts; server routes; systemCapabilities.ts` | qa-stage2; Firestore client rules deny direct CRUD | **PASS** |
| 22 | Split module catalog | P1 | `moduleRegistry/moduleCatalog/bootstrap` | qa-stage4a control-plane consistency | **PASS** |
| 23 | Credential fail-open | P0 | `CredentialService.ts; credentialSecretProtector.ts` | qa-stage4d 40/40; integration 17/17 | **PASS** |
| 24 | Provider/credential mismatch disclosure | P1 | `CredentialService.ts; server AI routes` | qa-stage4d; safe error codes/messages | **PASS** |
| 25 | Plaintext credentials | P0 | `credentialSecretProtector.ts; CredentialService.ts` | qa-stage4d behavior/integration; secret scan | **PASS** |
| 26 | Firestore 1 MiB session issue | P1 | `FirestoreSessionService.ts` | qa-stage3a; events subcollection | **PASS** |
| 27 | O(n) event rewrite | P1 | `FirestoreSessionService.appendEvent` | qa-stage3a; transactional single event append | **PASS** |
| 28 | Server session delete/history | P1 | `server.ts; FirestoreSessionService.ts` | qa-stage3b 9/9 | **PASS** |
| 29 | Mock history | P1 | `AgentCoordinationHistory.tsx` | qa-stage3b real server history | **PASS** |
| 30 | Central audit boundary | P0 | `CapabilityExecutionService.ts; AuditService.ts` | qa-stage4b 43/43 | **PASS** |
| 31 | confirmed:true bypass | P0 | `CapabilityExecutionService.ts; server.ts` | qa-stage4b behavior 18/18; stage5 static | **PASS** |
| 32 | Local filesystem persistence | P1 | `server/infrastructure/storage.ts` | qa-stage4c; stage5 static | **PASS** |
| 33 | Swallowed persistence error | P1 | `storage.ts; FirestoreSessionService.ts` | qa-stage4c fail-closed health/persistence checks | **PASS** |
| 34 | Audit 500 limit | P2 | `AuditService.ts` | qa-stage4b pagination/no hard cap | **PASS** |
| 35 | Audit filter-after-limit | P0 | `AuditService.list` | qa-stage4b; where(userId) before order/limit | **PASS** |
| 36 | Raw sensitive audit payload | P0 | `auditRedaction.ts; AuditService.ts` | qa-stage4b behavior redaction 18/18 | **PASS** |
| 37 | Memory query semantics | P1 | `UserDataService.listMemories; systemCapabilities.ts` | qa-stage2; query/category/status semantics present | **PASS** |
| 38 | Auto-approved Agent memory | P1 | `systemCapabilities.ts; UserDataService.ts` | Agent-created memory status=pending | **PASS** |
| 39 | Pending memory retrieval | P1 | `systemCapabilities.ts` | query capability forces status=approved | **PASS** |
| 40 | Mixed createdAt types | P2 | `UserDataService.ts` | toIso normalizes Timestamp/string to ISO | **PASS** |
| 41 | Module permission enforcement | P0 | `server.ts; permissionResolver.ts; serverCapabilityRegistry.ts` | qa-stage4a | **PASS** |
| 42 | Permission name drift | P1 | `shared/security/permissions.ts; module manifests` | qa-stage4a | **PASS** |
| 43 | False-green health | P1 | `runtimeHealthPolicy.ts; server.ts` | qa-stage4c behavior | **PASS** |
| 44 | ADC diagnostic | P2 | `server/lib/firebaseAdmin.ts; /api/health diagnostics` | qa-stage4c; env presence not ADC proof | **PASS** |
| 45 | uncaughtException | P1 | `server.ts` | qa-stage4c fatal exit invariant | **PASS** |
| 46 | Stop/cancellation | P1 | `requestCancellation.ts; RootAgent/ADK/tool/search` | qa-stage4c behavior/integration | **PASS** |
| 47 | Fake attachment | P2 | `AgentChatThread.tsx` | qa-stage4c; stage5 static | **PASS** |
| 48 | Session ID validation | P0 | `server.ts ClientSessionIdSchema` | qa-stage3b; stage5 static | **PASS** |
| 49 | Per-user rate limiting | P1 | `server.ts expensiveUserLimiter` | qa-stage4c; stage5 static | **PASS** |
| 50 | Public log endpoint | P1 | `server.ts /api/log-error` | qa-stage4c; strict schema/32kb/redaction/rate limit | **PASS** |
| 51 | CSP | P1 | `server.ts helmet productionCsp` | qa-stage4c; stage5 static | **PASS** |
| 52 | Credential reorder persistence | P1 | `CredentialService.reorderCredentials; aiKeysStore` | qa-stage4d integration deterministic transaction | **PASS** |
| 53 | Firestore Rules test realism | P1 | `firestore.rules; emulator tooling` | rules static deny verified, but Firebase Emulator/CLI unavailable | **BLOCKED** |
| 54 | Empty/fake tests | P2 | `src/__tests__/integration.test.ts; scripts/qa-stage5-static.mjs` | source test-quality RED 21/24 → GREEN 24/24; no empty/200-only legacy assertions remain | **PASS** |
| 55 | Module scale-out state freshness | P1 | `serverCapabilityRegistry.ts; storage.ts` | qa-stage4c refresh before discovery/execution | **PASS** |
| 56 | Health probe side effect | P1 | `FirestoreSessionService.probePersistenceHealth` | qa-stage4c behavior; stage5 static | **PASS** |
| 57 | Module toggle/audit atomicity | P1 | `storage.toggleModuleEnabledWithAudit` | Firestore transaction stages module + audit together | **PASS** |
| 58 | Fallback recovery context loss | P1 | `FirestoreSessionService.ts; sessionBackendPinning.ts` | qa-stage4c session integration 5/5 | **PASS** |
| 59 | Hybrid History | P1 | `FirestoreSessionService listSessions/listSessionSummaries` | qa-stage4c integration | **PASS** |
| 60 | appendEvent Runner-held session | P1 | `FirestoreSessionService/LocalInMemorySessionService` | qa-stage4c integration incl. no double append | **PASS** |
| 61 | Rotation classifier status precedence | P1 | `credentialRotationPolicy.ts` | qa-stage4d behavior 21/21 conflict cases | **PASS** |
| 62 | Client credential status preservation | P1 | `credentialStatus.ts; aiKeysStore.ts` | qa-stage4d behavior; stage5 static | **PASS** |
