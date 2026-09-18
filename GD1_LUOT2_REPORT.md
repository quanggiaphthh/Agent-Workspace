# Giai đoạn 1 – Lượt 2: AI Settings → Gemini Model → Persistence → Runtime

## A. BASELINE
- Agent runtime provider trước sửa: `google` duy nhất theo `AIConfigSchema` và `RootAgent`; credential manager vẫn có adapter cho provider khác nhưng không phải Agent runtime.
- Old default model: `gemini-2.5-flash-lite`.
- Old default source: `shared/contracts/ai.ts::DEFAULT_AGENT_MODEL`; store và RootAgent dùng constant này. `AIProviderManager.getGoogleModelRank` còn pin 2.5 Flash-Lite hạng 1; Settings fallback label cũng hiển thị 2.5 Flash-Lite.
- Model list source: `/api/ai/models` → credential server-side → provider adapter `listModels`; client cache/persist ở `providerLoadedModels`.
- Persistence: Zustand `persist`, namespace `ai-keys-storage_<firebase uid>`, `skipHydration: true`; FirebaseAuthProvider reset state, đổi namespace rồi rehydrate. Guest không rehydrate owner namespace.
- AIConfig path: `AdkRuntimeProvider` đọc Zustand sau `aiSettingsHydrated`, gửi `aiConfig` → `/api/agent/chat` → `AIConfigSchema.safeParse` → execution context → `RootAgent.buildAgent` → `Gemini({ model: aiConfig.agentModel })`.
- WebSearch path: `WebSearchService` dùng trực tiếp `aiConfig.agentModel` trong `GoogleGenAI.models.generateContent`.
- Credential ownership: `CredentialService.resolveCredential` từ chối personal credential có `providerId` khác; system credential resolve theo provider.

## B. ROOT CAUSES
1. Canonical default vẫn là 2.5 Flash-Lite nên fresh store, AIConfig default, RootAgent fallback và Settings fallback cùng kế thừa default cũ.
2. Google model ranking pin 2.5 Flash-Lite làm ưu tiên discovery cũ.
3. Persist migration version 1 không coi `gemini-2.5-flash-lite` là legacy default; owner đã lưu default cũ sẽ giữ 2.5 sau nâng cấp.
4. Persisted empty/non-Gemini model chưa được normalize ở migration; `AIConfigSchema` trước đó chỉ yêu cầu non-empty string nên tuple Google + model provider khác có thể đi tới runtime và fail muộn.
5. Settings fallback label hard-code tên 2.5 và discovery có thể thay local model bằng phần tử đầu khi selected model không nằm trong response, gây nguy cơ UI/default drift.

## C. FILES CHANGED
- `shared/contracts/ai.ts`: canonical default/name 3.5; Gemini model-ID validation in shared/server contract.
- `src/modules/settings/aiKeysStore.ts`: persist v2; migrate legacy 2.5/default aliases; normalize invalid persisted model; preserve unrelated settings; normalize setAgentConfig.
- `src/modules/settings/AgentAIManagerTab.tsx`: canonical 3.5 display/default; always expose canonical default in options; discovery no longer silently replaces canonical default.
- `server/core/ai/AIProviderManager.ts`: ranking pins canonical 3.5 default; 2.5 remains ordinary Flash-Lite selectable when discovered.
- `src/__tests__/model-regression.test.ts`: regression coverage for new default, migration, invalid state, provider/model rejection, secret non-persistence, ranking/runtime propagation.
- `GD1_LUOT2_REPORT.md`: this audit/handoff report.

## D. MODEL MIGRATION REPORT
Old default: `gemini-2.5-flash-lite`

New default: `gemini-3.5-flash-lite`

Canonical model constant/source: `shared/contracts/ai.ts::DEFAULT_AGENT_MODEL`; display name `DEFAULT_AGENT_MODEL_NAME`.

Production references to old default before: 2 exact model-ID references (`shared/contracts/ai.ts`, `server/core/ai/AIProviderManager.ts`) plus one old Settings display label.

Production references to old default after: 0 default/fallback references. Remaining exact references are legacy migration and tests/selectable fixture only.

Legacy persisted-state behavior: persist version bumped 1→2. `gemini-2.5-flash-lite`, `gemini-3.8-flash`, and `gemini-flash-lite-latest` migrate to canonical 3.5 default. Other AI settings are spread/preserved.

Invalid persisted-state behavior: empty/non-Gemini model recovers to canonical default. If a persisted Google discovery list exists, a non-default selected model absent from that list recovers to canonical default. A valid discovered selectable Gemini model survives.

Selectable model list behavior: models remain server-discovered from Google for the selected Google credential; canonical 3.5 default is injected into UI options if discovery/cache does not list it. 2.5 Flash-Lite is not removed if Google discovery returns it.

Settings UI model: canonical default `gemini-3.5-flash-lite`, label `Gemini 3.5 Flash-Lite`.

Store model: `AI_SETTINGS_RESET.agentModel = DEFAULT_AGENT_MODEL`; persisted state migrates/normalizes to the same contract.

AIConfig model: `AIConfigSchema` defaults to canonical 3.5 and rejects non-Gemini model IDs.

Server validated model: `/api/agent/chat` uses `AIConfigSchema.safeParse`; no silent model substitution server-side.

RootAgent/runtime model: exact `aiConfig.agentModel` is passed to `Gemini`; empty config defaults through shared schema to 3.5.

WebSearch model path: exact `aiConfig.agentModel` is passed to `GoogleGenAI.models.generateContent`; no separate WebSearch fallback found.

Model-specific config findings: RootAgent has no 2.5-specific temperature/topP/topK/thinking/maxOutputTokens/response schema configuration. `AIProviderManager.testModel` uses only `maxOutputTokens: 2` for explicit model testing. WebSearch config uses Google Search tool. No parameter was changed because source alone does not prove incompatibility.

Credential interaction findings: UI Agent provider is fixed to Google and credential selector filters Google credentials. Server `CredentialService.resolveCredential` rejects provider mismatch. `credentialId` is metadata persisted; raw API key secret is not included by Zustand `partialize`. Full Credential workflow intentionally deferred to Lượt 3.

Tests: automated Vitest BLOCKED because project dependencies/node_modules are absent. Global `tsc --noEmit` ran but is BLOCKED as a meaningful project typecheck by missing dependencies/types; errors begin with missing express/react/zod/@google/adk/vitest etc. Static grep/code-path checks completed.

Items requiring AI Studio runtime verification: existence/availability and actual Gemini API compatibility of `gemini-3.5-flash-lite`; ADK Gemini invocation; model discovery response; explicit model test; Google Search grounding with 3.5; full hydration/login/logout behavior in browser runtime.

## E. TEST REPORT
- `node_modules/.bin/vitest` availability + targeted `src/__tests__/model-regression.test.ts`: **BLOCKED** — node_modules/vitest absent.
- `tsc --noEmit`: **BLOCKED** as project verification — global tsc runs, but project dependencies/type packages are absent; output is dominated by TS2307 missing modules and derivative JSX/Node typing errors.
- `node --check scripts/qa-stage4a.mjs`: **PASS** syntax-only. Script intentionally not modified.
- Repository grep for `gemini-2.5-flash-lite`: **PASS** static regression classification; 5 references remain, all in legacy migration or tests/selectable fixture; no unintended production default/fallback.
- Diff against input checkpoint: **PASS** static scope check; only five implementation/test files plus this report differ/new.

## F. INTENTIONALLY NOT DONE
- Lượt 3: no Credential Manager/workflow completion, key rotation changes, or credential UX redesign.
- End of Giai đoạn 1: did not fix known `scripts/qa-stage4a.mjs` regex regression.
- AI Studio: no real Gemini call, no Google Search call, no deployment, no upload, no runtime compatibility claim.
- No Agent Chat streaming/session/history, Tasks, Memory, Web Search business logic, HITL, Firebase Rules, PORT, CI/CD, GitHub commit/push, or unrelated refactor.
