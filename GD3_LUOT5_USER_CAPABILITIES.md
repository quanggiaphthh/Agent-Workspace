# GĐ3 LƯỢT 5 — EXISTING USER CAPABILITIES + AGENT WORKFLOW HARDENING

## 1. Baseline
Source of truth: `agent-workspace-gd3-luot4-hitl-tool-resume.zip`.
Canonical SHA-256 verified before edits: `aee5945df0a7f0a335963986b1b00521b393d40794a3c4d1f0993a29d7a87c00`. ZIP integrity PASS; 224 entries. GĐ3 Lượt 1–4 reports and implementations were present. No GitHub/main or AI Studio snapshot was merged.

## 2. Pre-implementation capability inventory
| Capability | Handler/backend | Input / output | Permission / module | Side effect / confirmation | Discoverability / credentials | Pre-L5 usefulness / gap |
|---|---|---|---|---|---|---|
| `system.web.search` | `WebSearchService.search` → `@google/genai` Google Search grounding | query → answer, sources(title,url), searchQueries | `web.search` / system | none / none | removed when Web Search setting off; selected Gemini credential required | executable; source metadata existed, but provider arrays/text had no explicit small contract bounds |
| `system.memory.query` | `UserDataService.listMemories` → Firestore `agent_memories` | optional query/category → approved memories | `memory.read` / system | none / none | removed when Memory setting off | usable; backend already owner-scoped and limit 20, output array/schema was not explicitly max-bounded |
| `system.memory.add` | `UserDataService.addMemory` → Firestore | content/category → pending memory identity | `memory.write` / system | mutation / none | removed when Memory setting off | usable as explicit proposal; writes `pending`, requires later product approval before query reuse; descriptor wording could mislead model into unsolicited storage |
| `system.tasks.list` | `UserDataService.listTasks` → Firestore `agent_tasks` | status → tasks | `tasks.read` / tasks | none / none | module/permission filtered | usable, but list was unbounded after Firestore read |
| `system.tasks.create` | `UserDataService.createTask` → Firestore | task fields → created task | `tasks.write` / tasks | mutation / none | module/permission filtered | usable; L2 idempotency applies through Agent gateway; current canonical descriptor does **not** require HITL |
| `ui.openEntity` | server returns UI command; `AdkToolHandler` applies it | module/entity identity → UI action | none / ui | ui-local / none | server tool | UI-local command; target module was not server-checked |
| `ui.openModule` | server returns UI command; `AdkToolHandler` applies it | moduleId → UI action | none / ui | ui-local / none | server tool | UI-local command; could request missing/disabled module |
| `ui.refresh` | server returns UI command; eventBus applies it | optional target → UI action | none / ui | ui-local / none | server tool | usable UI projection; does not prove backend success |
| `ui.showNotification` | server returns UI command; eventBus applies it | message/type → UI action | none / ui | ui-local / none | server tool | usable UI projection; message was unbounded |

## 3. Actual gaps
The canonical infrastructure was already present. L5 gaps were product-contract gaps: explicit bounds for search/memory/task results, server validation of UI navigation targets, model-facing descriptions that accurately describe semantics, and a focused behavioral suite for the nine existing capabilities. No new capability was required.

Important discovered limitation: none of the nine canonical capabilities currently declares `confirmationPolicy: required`. `system.memory.add` stores a `pending` memory proposal but this is domain approval state, not L4 tool HITL. `system.tasks.create` is mutation + idempotency protected, but its current descriptor is `confirmationPolicy: none`. L5 did not silently change business policy merely to exercise L4.

## 4. Architecture preserved
Canonical path remains RootAgent/ADK → server-authorized FunctionTool → CapabilityToolAdapter → CapabilityExecutionService → ServerCapabilityRegistry → existing handler/backend → validated bounded result → FunctionResponse → native ADK continuation. No registry, gateway, workflow engine, UI command bus, auth/session/SSE/audit redesign was introduced.

## 5. Web Search
Provider remains server-side `@google/genai` with Google Search grounding and credential resolution through `CredentialService`. Web Search setting still removes discovery and execution fails closed if disabled. AbortSignal continues into provider call. L5 bounds answer to 120,000 chars, unique sources to 20, searchQueries to 20, and preserves title+URL source identity. Provider exceptions still pass through existing safe provider handling in `WebSearchService` and canonical gateway handling.

## 6. Search source/result contract
Output schema now explicitly requires: answer ≤120,000 chars; ≤20 sources with bounded title and valid URL; ≤20 bounded search queries. Empty answer/sources remains a valid successful result. No citation framework was invented: current provider contract exposes title+URL, not per-sentence citation spans/snippets.

## 7. Memory Query
Firestore remains the backend. User ownership is bound by server-supplied userId. Only approved memories are queried by the capability, with limit 20. Output schema now also caps array length to 20 and bounds memory fields, preventing legacy/backend anomalies from becoming unbounded Agent context.

## 8. Memory Add
Still writes exactly one `pending` memory with `source: Agent đề xuất`. Input remains content ≤10,000 and category ≤100. Description now instructs tool selection only for explicit user intent to remember/store. Mutation idempotency remains L2 authority when invoked through Agent. No automatic-memory policy was added.

## 9. Tasks List
Still owner-scoped Firestore data. `UserDataService.listTasks` now returns at most 100 records after deterministic createdAt sorting; output schema independently caps at 100. Empty list remains success.

## 10. Tasks Create
Existing create semantics remain unchanged: one task, owner-scoped, validated fields, `sideEffect: mutation`, `confirmationPolicy: none`. L2 stable sessionId+functionCallId idempotency remains the duplicate-mutation authority. No update/delete capability was added.

## 11. UI capabilities
No second UI bus was added. `AdkToolHandler` remains the client projection of canonical `uiAction` tool responses. `ui.openModule` and `ui.openEntity` now re-check the target module against server module settings before returning a success action. UI inputs are strict/bounded. Refresh and notification contracts are bounded and explicitly documented as UI-local requests, not evidence of backend success. `openEntity` still does not prove the entity exists; it only validates target module availability and forwards the actual entity identity.

## 12. Agent tool descriptions
Descriptions were hardened for all five system capabilities and four UI capabilities where needed: intended use, limits, mutation semantics, pending-memory semantics, and UI-local semantics are explicit. Authorization remains server-side and is not delegated to prompt wording.

## 13. Result/output contracts
Existing Zod runtime authority is preserved. Added explicit result bounds for search, memory query, tasks list, and field sizes. L1 512 KiB serialized result boundary remains the final canonical backstop. Raw Firebase/provider objects are not returned.

## 14. Empty/partial results
Search with no sources, memory with no matches, and tasks with no rows are legitimate successful empty results. Malformed provider/backend data fails output validation where declared. No fake data is generated.

## 15. Credentials
Web Search uses existing `CredentialService`; no credential architecture change. Missing/provider credential failures remain errors and no API key is included in capability result contracts or audit result expansion.

## 16. Cancellation/timeout
No competing timeout was added. Existing GĐ2 request AbortSignal/deadline remains authority. WebSearchService continues passing AbortSignal to provider. Mutation ambiguity/idempotency semantics remain L2 authority.

## 17. Workflow: Search
Infrastructure supports search → structured FunctionResponse → native ADK continuation → answer. Discovery still honors Web Search setting. External provider is a true boundary suitable for mocking. Real Gemini/provider execution was not called in this checkpoint.

## 18. Workflow: Memory Query
Infrastructure supports memory.query → bounded approved owner-scoped memories → FunctionResponse → answer, without mutation or HITL.

## 19. Workflow: Memory Add
Infrastructure supports explicit memory.add → idempotent mutation → pending-memory result → Agent acknowledgement. This is not L4 confirmation; it is a domain-level pending record by current product design.

## 20. Workflow: Tasks List → Create
Both tools remain independently discoverable and composable by native ADK sequential tool loop. `tasks.create` is mutation/idempotency protected but does not currently invoke L4 HITL because canonical policy is `none`.

## 21. Workflow: Tool → UI
Existing UI actions remain composable after data tools. Success means the server produced a validated UI command; the browser applies it through `AdkToolHandler`. Target module checks reduce false-success navigation for openModule/openEntity.

## 22. Prompt-injection boundary
Search and memory content remain plain tool result data. No result can directly register/execute a capability, forge functionCallId, bypass registry filtering, permissions, module policy, confirmation, or idempotency. L5 does not claim to solve general LLM prompt injection; it preserves the server authority boundaries.

## 23. Security
Verified statically: server-owned discovery unchanged; permissions/modules/settings still enforced; no capability bypass added; mutation identity unchanged; no client-supplied functionCallId authority added; output bounds tightened; UI targets are server-checked; no credentials/raw Firebase objects added to result shapes.

## 24. Audit
AuditService was not redesigned. Canonical gateway continues logging capability/user/session/tool correlation and safe summaries. L5 does not add full tool result logging.

## 25. Files changed
Production: `server/core/capabilities/systemCapabilities.ts`; `server/core/capabilities/uiCapabilities.ts`; `server/core/data/UserDataService.ts`; `server/core/search/WebSearchService.ts`; `PRODUCTION_SOURCE_MANIFEST.sha256` hashes updated under existing 131-path policy.
Tests: `server/core/capabilities/__tests__/userCapabilities.test.ts` added.
Report: `GD3_LUOT5_USER_CAPABILITIES.md` added.

## 26. Tests added/changed
Added 48 named behavioral/contract cases covering the requested Web Search (1–10), Memory (11–18), Tasks (19–26), UI (27–32), workflows/composition (33–40), and security/failure/cancellation boundaries (41–48). Existing L1–L4 tests were not rewritten.

## 27. Lượt 5 targeted results
**RUNTIME VERIFICATION DEFERRED.** `npm ci --no-audit --no-fund` timed out in the execution environment, so Vitest could not be installed/run. The 48 tests are present but are not claimed PASS.

## 28. Lượt 4 regression
Runtime deferred because dependencies could not be installed. Existing L4 test files remain present and unchanged.

## 29. Lượt 3 regression
Runtime deferred because dependencies could not be installed. Existing L3 test files remain present and unchanged.

## 30. Lượt 2 regression
Runtime deferred because dependencies could not be installed. Existing L2 test files remain present and unchanged.

## 31. Lượt 1 regression
Runtime deferred because dependencies could not be installed. Existing L1 capability contract test remains present and unchanged.

## 32. Full Vitest
Not run: dependency installation timed out. No PASS is claimed.

## 33. QA
All canonical dependency-independent QA scripts executed successfully: Stage1 22/22; Stage2 22/22; Stage3A 8/8; Stage3B 9/9; Stage3C 8/8; Stage4A 20/20; Stage4B 43/43; Stage4C 42/42; Stage4D 40/40; Stage5-static 24/24. **Total 238/238 PASS.**

## 34. TypeScript
Not run because npm dependencies were unavailable after npm ci timeout. In particular, installed `@google/adk` API compatibility (including prior L3 `maxLlmCalls`) remains a required external runtime gate.

## 35. Build
Not run because npm dependencies were unavailable. No build PASS is claimed.

## 36. Manifest
Existing coverage policy preserved. Old entries: 131. New entries: 131. Verification after updating hashes: 131 matched, 0 mismatched, 0 missing. Tests/reports were not added because existing manifest policy does not cover them.

## 37. User-value classification
A. Web search and answer — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED** (also requires valid Gemini credential/provider at runtime).
B. Memory lookup and answer — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**.
C. Explicit memory storage — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**; creates pending memory proposal, not immediately approved reusable memory.
D. Task inspection — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**.
E. Task creation — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**; idempotent Agent mutation path exists; no canonical HITL requirement today.
F. UI navigation/action — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**; openEntity does not validate entity existence.
G. Sequential composition — **FUNCTIONALLY IMPLEMENTED BUT RUNTIME UNVERIFIED**; relies on preserved L3 native ADK loop. A real canonical L5 capability does not currently exercise L4 HITL because all nine confirmation policies are none.

## 38. Remaining risks
Primary risk is deferred runtime verification across L2–L5 due dependency installation timeout. The 48 new tests have not been TypeScript-compiled or executed. Real provider behavior is intentionally untested. Search has source title+URL but not snippet/per-claim citations. `openEntity` validates module availability, not entity existence. Memory approval after pending creation remains outside these nine Agent capabilities. No current canonical capability requires L4 confirmation, so production-value HITL remains infrastructure-ready but not exercised by these nine tools.

## 39. Explicit non-goals
No tasks.update/delete, files/workspace, connectors/plugins, generic HTTP fetch, browser automation, registry/gateway/HITL/idempotency/auth/session/SSE/audit redesign, workflow engine, real Gemini call, deployment, commit/push, or GĐ3 Lượt 6 work.

## 40. Final verdict
**IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION REQUIRED**

Implementation and static/canonical QA are complete, but npm dependency installation timed out, so targeted Vitest, prior-layer Vitest regression, TypeScript lint, `@google/adk` installed-API verification, and build remain unverified. This checkpoint must not be called FINAL PASS.
