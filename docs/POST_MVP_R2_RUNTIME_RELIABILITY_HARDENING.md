# POST-MVP R2 — RUNTIME / PROVIDER RELIABILITY HARDENING

## 1. Classification

R2 is a bounded post-MVP reliability hardening workstream. It does not reopen locked Agent/Task behavior from R1, add a product module, change Firebase persistence, alter capability/HITL policy, or add dependencies.

Canonical deployed production remains R1 checkpoint `ee570f44516d639f7a6e00f5da3dc6427d597034` until R2 receives bounded live promotion evidence.

## 2. Source audit result

Fresh audit confirmed external AI-provider management requests in `server/core/ai/AIProviderManager.ts` used raw `fetch()` calls without an application-owned deterministic deadline. A hung upstream could therefore hold Settings/provider HTTP work longer than intended even though the main Agent runtime already had its own execution deadline/cancellation policy.

The previously recorded port mismatch remains environment-specific: the live AI Studio environment exposes `PORT=8080`, while its wrapper forwards hosted traffic to the application's local port 3000. R1 live deployment proved that mapping works. R2 does not change port binding because changing it without a replacement AI Studio ingress contract could regress the current deployment.

## 3. Reuse / implementation decision

No framework or dependency was added. The corrective stays inside the existing provider adapter boundary:

- one shared provider HTTP timeout policy;
- default timeout: 20,000 ms;
- optional `AI_PROVIDER_TIMEOUT_MS` override;
- accepted configured range: 1,000–120,000 ms;
- invalid values fall back to the default;
- every existing provider adapter uses the same bounded request helper;
- a provider timeout becomes a safe `PROVIDER_TIMEOUT` / HTTP 504-style failure;
- parent AbortSignal support is preserved for future callers.

Google, OpenAI, Anthropic, NVIDIA NIM and OpenCodeZen provider-management requests all use the same policy.

## 4. Test minimization

Only the app-owned boundary was tested:

1. default/configuration bounds for `AI_PROVIDER_TIMEOUT_MS`;
2. a provider request that never resolves is aborted deterministically and produces `{ code: 'PROVIDER_TIMEOUT', status: 504 }`.

The first CI attempt exposed a test-harness unhandled-rejection ordering issue while all assertions passed. The test was corrected by attaching the rejection assertion before advancing the fake timer; production code was not changed for that CI-only issue.

## 5. Canonical source verification

Validated R2 source checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

Canonical GitHub Actions:

- workflow: `GD4 Canonical Verification`;
- run number: #152;
- run id: `36089895220`;
- result: **SUCCESS**.

The run passed dependency/security policy, manifest verification, TypeScript, targeted regressions, capability bridge, full Vitest, QA Stage 1–5, W11 Security QA, production build and final manifest verification.

## 6. Current status

**R2 SOURCE / STATIC PASS — LIVE PROMOTION PENDING.**

R2 does not replace production anchor `ee570f44516d639f7a6e00f5da3dc6427d597034` until a bounded live smoke confirms normal Google/Gemini settings/provider operations after deployment.

Minimum live gate:

1. deploy exact R2 source checkpoint;
2. owner login succeeds;
3. Settings → Trợ lý AI loads the Gemini model list with the existing credential;
4. test-key/test-model path completes normally with a valid credential;
5. invalid credential remains a bounded recoverable error;
6. Agent chat quick smoke remains unaffected;
7. `/api/health` remains healthy.

A synthetic timeout is already behavior-tested in CI and does not need to be forced against a real provider in production.

## 7. Deferred findings

Not part of R2 source change:

- hard-coded local port 3000: accepted for the current AI Studio wrapper; remains deployment-portability debt;
- public health deep-probe cost: low operational priority for the current private single-user deployment;
- package/README/typing/router refactors: maintenance work, not reliability blockers for this bounded pass.

## 8. Verdict

**R2 SOURCE / STATIC VERIFICATION — PASS.**

**Production promotion — PENDING BOUNDED LIVE SMOKE.**
