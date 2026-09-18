# GIAI ĐOẠN 1 – LƯỢT 3 — CREDENTIAL WORKFLOW REPORT

## BASELINE

- System Gemini credential source: `process.env.GEMINI_API_KEY` in `CredentialService.getSystemCredential()`. `GOOGLE_API_KEY` is not used by the production credential resolver.
- Personal credential transport: the browser sends the user-entered raw key only in authenticated request bodies for `/api/ai/test-key` and `/api/ai/credentials`; after save, list/sync paths use metadata only.
- Personal credential storage: Firestore `users/{uid}/credentials/{credentialId}`. New secrets are protected server-side by `credentialSecretProtector` using versioned AES-256-GCM and `CREDENTIAL_ENCRYPTION_KEY`/`CREDENTIAL_ENCRYPTION_KEY_ID`. Legacy plaintext/pre-GĐ4D AES-GCM fields are migrated transactionally and deleted.
- Browser metadata before fix: `GET /api/ai/credentials` returned id/userId/providerId/name/priority/status/timestamps/encryptionVersion, never raw `key`/protected secret. Zustand persisted `credentialId` but not `keys`.
- Agent selection before fix: Settings always rendered `system` even when `GEMINI_API_KEY` was absent and rendered every Google credential regardless of lifecycle status. Persisted stale/deleted/non-Google `credentialId` was not reconciled at login.
- Server resolution before fix: `resolveCredential(userId, providerId, credentialId)` resolved `system` only for Google, loaded personal credentials under the authenticated user's Firestore subtree, asserted stored ownership, checked provider equality and required `active` status.
- Rotation before fix: selected `system` yielded only `[system]`; selected personal credential yielded selected + other active personal credentials for the same user/provider in durable priority order. Rotation occurs only on authentication/quota failures before any streamed response. RootAgent indexed `candidates[0]` when candidate count was <=1, so an empty candidate result could crash with undefined access.

## ROOT CAUSES

1. No server metadata endpoint told Agent Settings whether the System Gemini Key actually existed, so UI always offered `system`.
2. Agent credential selector filtered by provider but not by active status.
3. Persisted `credentialId` was rehydrated without reconciling it against current server credential metadata; deletion/inactivation/provider mismatch could leave stale state until runtime failure.
4. Deleting the selected personal credential removed it from the local list but did not normalize the selected Agent credential.
5. RootAgent had no explicit zero-candidate guard in the auto-rotation branch.

## FILES CHANGED

- `server/core/ai/CredentialService.ts` — added metadata-only Agent credential options (`systemAvailable` + active personal Google metadata); no secret exposure.
- `server.ts` — added authenticated `GET /api/ai/credentials/agent-options` endpoint using server-owned credential state.
- `src/modules/settings/aiKeysStore.ts` — added non-persisted system availability state, deterministic Agent credential normalization, server reconciliation during sync, and post-delete resync/recovery.
- `src/modules/settings/AgentAIManagerTab.tsx` — Agent selector now offers only available system credential and active personal Google credentials; adds clear no-credential/loading UX and disables credential/model probes when selection is unusable.
- `src/lib/FirebaseAuthProvider.tsx` — after user-scoped rehydrate, reconciles credential metadata before setting `aiSettingsHydrated=true`.
- `server/agent/adk/RootAgent.ts` — explicit controlled `NO_ROTATION_CANDIDATE` error before any candidate indexing.
- `src/__tests__/credential-workflow.test.ts` — targeted client/RootAgent regression coverage.
- `src/__tests__/credential-service-system.test.ts` — targeted system-key source/provider coverage.
- `GD1_LUOT3_REPORT.md` — this handoff report.

`scripts/qa-stage4a.mjs` was not modified; its SHA-256 remains `f810c62069a0a1ca55ca4cb8ac03d56339d156da36b17ea2ca7e8bee8400ab45`.

## CREDENTIAL CONTRACT AFTER FIX

- System key: server-only `GEMINI_API_KEY`; Agent options expose only availability boolean. Missing key is not fabricated and `resolveCredential` returns `SYSTEM_CREDENTIAL_UNAVAILABLE` rather than dereferencing null.
- Personal key: authenticated raw input is transient in component/request memory, then protected server-side and stored under the authenticated user's Firestore credential subtree. List responses are metadata-only.
- Agent-selectable credentials: `system` only when server reports it available; otherwise active personal `providerId=google` credentials only. Other provider credentials remain in the general Credential Manager but cannot be selected for Agent.
- Persistence: persists `credentialId` and AI settings, not credential list, raw secret, system availability, or protected secret. Per-user persistence namespace remains `ai-keys-storage_<uid>`; guest state is reset separately.
- Ownership enforcement: server Firestore path is scoped by verified user ID and stored `userId` is asserted. Client-supplied IDs cannot resolve another user's credential through the Agent resolver.
- Provider enforcement: Agent contract remains `agentProvider=google`; `resolveCredential` rejects personal provider mismatch and inactive credentials server-side. Client filtering is UX only.
- Deleted credential behavior: delete is followed by server resync. If selected ID is stale, recovery is deterministic: available system key first, otherwise lowest-priority active personal Google credential; if none exists, state keeps the non-secret `system` sentinel but UI presents an explicit no-credential state and Agent server returns the system-unavailable domain error.
- Zero candidate behavior: RootAgent returns controlled `NO_ROTATION_CANDIDATE` / HTTP-domain status 409 instead of indexing `undefined`.
- Rotation behavior: unchanged otherwise. Explicit system selection remains system-only. Personal selection rotates only among active personal credentials for the same user/provider, in durable priority order; only auth/quota failures before streaming rotate.
- Error redaction: existing provider/audit redaction retained. Raw API key, bearer token, protected payload and encryption key are not included in credential metadata or new Agent-options response.

Canonical model remains `gemini-3.5-flash-lite`; no default-model change was made.

## TEST REPORT

1. `npm test -- --run src/__tests__/credential-workflow.test.ts src/__tests__/credential-service-system.test.ts src/__tests__/model-regression.test.ts` — **BLOCKED**: checkpoint has no `node_modules`; shell reports `vitest: not found`.
2. `tsc --noEmit --pretty false` — **BLOCKED** as project typecheck: global TypeScript starts but project dependencies/types are absent (`express`, React, Zod, Firebase, ADK, Vitest, Node typings, etc.), producing dependency-resolution errors.
3. `node scripts/qa-stage4d.mjs` — **PASS**, Stage4D 40/40. Its nested behavior suite reports 21/21 and credential integration reports 17/17, including metadata-only listing, ownership/provider isolation, disabled exclusion, rotation ordering and secret redaction.
4. `node --check scripts/qa-stage4d.mjs` — **PASS**.
5. Direct standalone `node scripts/qa-stage4d-credential-integration.mjs` — **BLOCKED/FAIL in this invocation** because Node 22 attempted to load a temporary `.ts` module without the loader used by the parent QA harness (`ERR_UNKNOWN_FILE_EXTENSION`). The same integration suite is executed successfully by `qa-stage4d.mjs` and reported 17/17 there.
6. Static search of production environment references — **PASS**: Agent system credential resolver uses `GEMINI_API_KEY`; no production `GOOGLE_API_KEY` credential fallback found.
7. Static diff/hash verification of `scripts/qa-stage4a.mjs` — **PASS**, unchanged.

Automated Vitest/full TypeScript suite is therefore not claimed PASS.

## AI STUDIO RUNTIME VERIFICATION

- Verify `GEMINI_API_KEY` present/absent states render System Key availability correctly after login and refresh.
- Add/test/save a real Personal Google/Gemini key, refresh, and confirm metadata-only hydration and selected credential continuity.
- Delete the currently selected personal key and verify deterministic recovery (system first when available; otherwise next active Google credential).
- Mark/produce invalid or quota-limited credentials in the environment and verify safe user-facing errors and pre-stream rotation behavior.
- Verify `gemini-3.5-flash-lite` works with System and Personal credentials in the actual Google ADK/Gemini runtime.
- Verify model discovery/test-model and Google Search grounding with the selected Gemini credential using real environment access.

## INTENTIONALLY NOT DONE

- Did not modify `scripts/qa-stage4a.mjs` (reserved cleanup finding).
- Did not build a model registry or change `isAgentModelId()` semantics.
- Did not change canonical default model.
- Did not open Agent runtime to non-Google providers.
- Did not redesign Credential Manager or invent a new credential lifecycle state machine.
- Did not change Agent Chat/session/history, Tasks, Memory, Web Search business logic, HITL, Firebase Rules, deployment, PORT, CI/CD.
- Did not call Gemini/Google Search APIs, deploy, commit/push GitHub, or upload AI Studio.
