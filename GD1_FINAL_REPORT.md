# GIAI ĐOẠN 1 — FINAL REPORT

Checkpoint: `agent-workspace-gd1-final-settings-owner-model-credential.zip`

## 1. OWNER PERMISSIONS

- Canonical permission source: `shared/security/permissions.ts` → `SINGLE_USER_OWNER_PERMISSIONS`.
- Effective authenticated-owner baseline: `tasks.read`, `tasks.write`, `tasks.delete`, `memory.read`, `memory.write`, `memory.delete`, `web.read`, `web.search`, `settings.read`, `settings.write`, `module.manage`.
- `USER_DEFAULT_PERMISSIONS` remains a compatibility alias to the canonical owner set.
- Server authority is unchanged: Firebase Admin verifies the ID token before `resolveVerifiedPermissions()` is applied. Browser-supplied role/permission/admin fields are not server authority.
- Final cleanup: `scripts/qa-stage4a.mjs` now validates the canonical `SINGLE_USER_OWNER_PERMISSIONS` array and the compatibility alias instead of assuming `USER_DEFAULT_PERMISSIONS` is itself a literal array.

## 2. MODEL

- Agent provider: `google` only.
- Canonical default model: `gemini-3.5-flash-lite` from `shared/contracts/ai.ts` (`DEFAULT_AGENT_MODEL`).
- UI name: `Gemini 3.5 Flash-Lite`.
- Legacy persisted defaults including `gemini-2.5-flash-lite` migrate to the canonical default without deleting Memory, Web Search or credential metadata.
- Valid Gemini-shaped persisted selections remain selectable under the existing policy; model existence still requires runtime/model-discovery verification.
- Runtime path: Settings → Zustand `aiKeysStore` → `AdkRuntimeProvider` AIConfig → server `AIConfigSchema` → `RootAgent` → ADK `Gemini`/`RotatingGemini`.
- Static audit found no unintended production default/fallback to `gemini-2.5-flash-lite`; remaining references are legacy migration/selectable-model tests.

## 3. CREDENTIAL

- System key source: server-only `process.env.GEMINI_API_KEY` in `CredentialService.getSystemCredential()`; Google-only.
- Personal storage: Firestore user-scoped credential collection under server credential service.
- Encryption: versioned AES-256-GCM protected secret; raw personal key is not returned by credential list metadata and is not persisted in Zustand.
- Agent selector: System credential only when server metadata reports `systemAvailable=true`; otherwise active personal `google` credentials only. Non-Google credentials remain in the general credential manager but are not Agent-selectable.
- Recovery: persisted/deleted/inactive/wrong-provider Agent credential is reconciled by `syncKeys()`; deterministic preference remains current valid selection → System if available → first active personal Google credential. The historical `system` sentinel may remain in store when no credential exists, but `isAgentCredentialUsable()` makes that state explicitly unusable and the UI does not present System as available.
- Ownership/provider enforcement: server-side `CredentialService.resolveCredential()` enforces user ownership, provider match and active status; client filtering is UX only.
- Rotation semantics are unchanged: selected System → System only; selected personal → selected plus eligible active personal credentials for the same user/provider. No automatic System→Personal fallback was added.
- Zero rotation candidates are already handled by `RootAgent` with controlled `NO_ROTATION_CANDIDATE` instead of an undefined candidate crash.

## 4. SETTINGS

- Persistence namespace: `ai-keys-storage_<firebase uid>` for authenticated owner and `ai-keys-storage_guest` for guest. Auth transition resets user-scoped AI state before namespace switch and rehydrates only the selected namespace.
- Hydration: authenticated flow rehydrates persisted settings, then calls `syncKeys()` against server-owned credential metadata, then marks AI settings hydrated.
- Save behavior: Save writes provider/model/credentialId/autoRotate/Memory/Web Search and related settings together without deleting unrelated settings. Saving Memory/Web Search/model is not blocked merely because no Gemini credential is currently available.
- Local Settings draft is synchronized back to reconciled store state, including credential deletion/reconciliation during the same Settings session.
- Agent-ready state is now visible in Settings. READY requires authenticated user, auth complete, settings hydrated, Google provider, Gemini-shaped model and a credential that is actually usable according to server-synced metadata.
- No-credential state explicitly says no Gemini credential is available and instructs the owner to configure System Gemini Key or an active Personal Google/Gemini Key.
- Credential metadata sync failures now produce a finite error state instead of leaving the UI indefinitely at “checking credential”. No secret is included in that error.
- Auto Rotate copy matches backend behavior: personal-only rotation for a selected personal credential and no implicit fallback to System.

## 5. SECURITY

- System `GEMINI_API_KEY` remains server-side and is never persisted to client state.
- Personal raw credential input remains transient UI state during add/test; persisted Zustand snapshot excludes credential entries/secrets.
- Credential list response exposes metadata only.
- Browser is not credential authority: server resolves credential by verified user ID, provider, ownership and status.
- Existing Firebase server-side identity, Central Execution Gateway, server-authoritative HITL and Firestore security boundaries were not changed.
- No Gemini/Google provider API was called during this work.

## 6. FILES CHANGED IN LƯỢT 4

1. `scripts/qa-stage4a.mjs` — remove brittle literal-array assumption; validate canonical owner permission set and compatibility alias.
2. `src/modules/settings/aiKeysStore.ts` — add explicit credential usability helper and finite credential metadata sync-error state; no secret persistence added.
3. `src/modules/settings/AgentAIManagerTab.tsx` — add Agent-ready/no-credential status, use canonical credential usability/model validation, surface sync failure, and allow unrelated settings to save when Agent credential is unavailable.
4. `src/__tests__/credential-workflow.test.ts` — add regression coverage proving unavailable System sentinel is not considered usable and non-Google/inactive credentials are not Agent-usable.
5. `GD1_FINAL_REPORT.md` — this final GĐ1 handoff report.

## 7. TEST REPORT

- `node scripts/qa-stage4a.mjs` — **PASS**, 20/20.
- `node scripts/qa-stage4d.mjs` — **PASS**, 40/40; nested behavior 21/21 and credential integration 17/17.
- `node --check scripts/qa-stage4a.mjs` — **PASS**.
- `node --check scripts/qa-stage4d.mjs` — **PASS**.
- Targeted Vitest (`singleUserOwnerPermissions`, `model-regression`, `credential-workflow`, `credential-service-system`) — **BLOCKED**: checkpoint intentionally contains no `node_modules`; `node_modules/.bin/vitest` is unavailable.
- `tsc --noEmit` — **BLOCKED**: checkpoint intentionally contains no `node_modules`; local project TypeScript binary/dependency graph is unavailable.
- Static final GĐ1 search for `gemini-2.5-flash-lite`, `gemini-3.5-flash-lite`, `GEMINI_API_KEY`, `credentialId`, `USER_DEFAULT_PERMISSIONS`, `SINGLE_USER_OWNER_PERMISSIONS` — **PASS (static classification)**: no unintended old-model production default/fallback; System key source remains server-side; permission alias is intentional.

Automated runtime PASS is not claimed for Vitest, TypeScript, production build, Firebase or Gemini runtime.

## 8. AI STUDIO VERIFICATION PLAN

Run only after checker approves this checkpoint:

1. `npm ci` and verify dependency installation from the checkpoint lockfile.
2. `npx tsc --noEmit` (or project `npm run lint`).
3. Targeted Vitest for owner permissions, model settings/migration, credential workflow and system credential behavior; then the broader/full suite if targeted tests pass.
4. Production `npm run build`.
5. Firebase authenticated runtime: login, logout/login, refresh, per-user settings namespace and server authorization.
6. System `GEMINI_API_KEY` availability both configured and absent; verify browser receives availability only, never raw key.
7. Personal Google/Gemini credential add → test → list → select → refresh → delete → reconciliation; verify raw key never returns from list or persistence.
8. Gemini 3.5 Flash-Lite model discovery and `test-model` against an authorized Gemini credential.
9. Agent initialization with System Key using `gemini-3.5-flash-lite`.
10. Agent initialization with Personal Google/Gemini Key using `gemini-3.5-flash-lite`.
11. Invalid/deleted/inactive/wrong-provider credential behavior and safe user-facing errors.
12. Quota/rate-limit rotation behavior, only if it can be exercised safely without altering production state.
13. Google Search grounding/Web Search compatibility with `gemini-3.5-flash-lite`, if that capability is enabled for the runtime test account.
14. Model discovery failure and credential metadata sync failure UX: no infinite spinner and no sensitive provider payload exposure.

Items above are runtime verification, not requests to redesign or implement unapproved features.

## 9. INTENTIONALLY NOT DONE

- No Agent Chat streaming/session/history stabilization (GĐ2).
- No Tasks, Memory or Web Search business-logic changes.
- No HITL changes.
- No multi-provider Agent runtime or model registry.
- No rotation architecture changes.
- No Firebase Rules/deployment/PORT/CI-CD changes.
- No Git commit/push/deploy.
- No AI Studio upload.
- No real Gemini or Google Search call.
- `isAgentModelId()` remains Gemini-shape validation; actual model existence is reserved for AI Studio/runtime model discovery.
