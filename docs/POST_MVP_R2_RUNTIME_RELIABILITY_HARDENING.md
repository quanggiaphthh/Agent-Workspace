# POST-MVP R2 --- RUNTIME / PROVIDER RELIABILITY HARDENING

## 1. Classification

R2 is a bounded post-MVP reliability hardening workstream. It does not
reopen locked Agent/Task behavior from R1, add a product module, change
Firebase persistence, alter capability/HITL policy, or add dependencies.

R2 implementation checkpoint is
`83e6c8940f21d43c3d791446f0d8017f65b866cd`. It passed canonical
implementation CI and the required live promotion. The R1 exact
previously deployed stable checkpoint remains
`ee570f44516d639f7a6e00f5da3dc6427d597034`. R2 live deployment was
verified to contain the R2 implementation behavior, but the available
evidence does not independently establish an exact current deployed
commit SHA.

## 2. Source audit result

Fresh audit confirmed external AI-provider management requests in
`server/core/ai/AIProviderManager.ts` used raw `fetch()` calls without
an application-owned deterministic deadline. A hung upstream could
therefore hold Settings/provider HTTP work longer than intended even
though the main Agent runtime already had its own execution
deadline/cancellation policy.

The previously recorded port mismatch remains environment-specific: the
live AI Studio environment exposes `PORT=8080`, while its wrapper
forwards hosted traffic to the application's local port 3000. R1 live
deployment proved that mapping works. R2 does not change port binding
because changing it without a replacement AI Studio ingress contract
could regress the current deployment.

## 3. Reuse / implementation decision

No framework or dependency was added. The corrective stays inside the
existing provider adapter boundary:

-   one shared provider HTTP timeout policy;
-   default timeout: 20,000 ms;
-   optional `AI_PROVIDER_TIMEOUT_MS` override;
-   accepted configured range: 1,000--120,000 ms;
-   invalid values fall back to the default;
-   every existing provider adapter uses the same bounded request
    helper;
-   a provider timeout becomes a safe `PROVIDER_TIMEOUT` / HTTP
    504-style failure;
-   parent AbortSignal support is preserved for future callers.

Google, OpenAI, Anthropic, NVIDIA NIM and OpenCodeZen
provider-management requests all use the same policy.

## 4. Test minimization and CI history

Only the app-owned boundary was tested:

1.  default/configuration bounds for `AI_PROVIDER_TIMEOUT_MS`;
2.  a provider request that never resolves is aborted deterministically
    and produces `{ code: 'PROVIDER_TIMEOUT', status: 504 }`.

Canonical CI history:

-   Run #151: **FAIL** because of test-harness rejection timing/handler
    sequencing. The assertions themselves were not evidence of a
    production implementation failure.
-   The test harness was corrected by attaching the rejection assertion
    before advancing the fake timer; production implementation code was
    not changed for that CI-only issue.
-   Run #152, ID `36089895220`: **SUCCESS** and remains the canonical R2
    implementation CI.
-   The canonical R2 implementation verification includes full Vitest
    **400/400 PASS**.
-   Documentation closeout baseline
    `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1` has canonical CI run
    #156, ID `36097654993`: **SUCCESS**. Run #156 is closeout-baseline
    evidence and does not replace run #152 as the R2 implementation CI.

## 5. Canonical implementation verification

Validated R2 implementation checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

Canonical GitHub Actions:

-   workflow: `GD4 Canonical Verification`;
-   run number: #152;
-   run id: `36089895220`;
-   result: **SUCCESS**.

The run passed dependency/security policy, manifest verification,
TypeScript, targeted regressions, capability bridge, full Vitest, QA
Stage 1--5, W11 Security QA, production build and final manifest
verification.

## 6. Live promotion and live evidence corrective

**R2 LIVE PROMOTION --- PASS / LOCKED.**

**R2 LIVE EVIDENCE CORRECTIVE --- PASS.**

The live promotion requirements were satisfied on the real environment.
Corrective live evidence verified:

1.  AI model list;
2.  valid credential/model provider request;
3.  Agent SSE;
4.  bounded Task/Home regression;
5.  application health and continuity.

The invalid-credential negative scenario is explicitly:

**SAFE-NOT-RUN**

Reason: preserve the production credential/secret and avoid modifying or
replacing it solely to manufacture a negative live test. This scenario
is **not** recorded or implied as PASS.

The synthetic timeout path is behavior-tested in canonical R2
implementation CI and does not need to be forced against a real provider
in production.

## 7. Checkpoint and deployment semantics

-   R1 exact previously deployed stable checkpoint:
    `ee570f44516d639f7a6e00f5da3dc6427d597034`.
-   R2 implementation checkpoint:
    `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
-   R2 implementation CI: #152 / `36089895220` / **SUCCESS**.
-   Documentation closeout baseline:
    `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1`.
-   Closeout-baseline CI: #156 / `36097654993` / **SUCCESS**.
-   R2 live deployment: verified to contain R2 implementation behavior
    and satisfy Live Promotion.
-   Exact current deployed commit SHA: **not independently established
    by the available evidence**.

Therefore neither the documentation closeout baseline nor any
unsupported SHA is promoted to "exact current deployed source".

## 8. Deferred findings

Not part of R2 source change:

-   hard-coded local port 3000: accepted for the current AI Studio
    wrapper; remains deployment-portability debt;
-   public health deep-probe cost: low operational priority for the
    current private single-user deployment;
-   package/README/typing/router refactors: maintenance work, not
    reliability blockers for this bounded pass.

## 9. Verdict

**R2 LIVE PROMOTION --- PASS.**

**R2 LIVE EVIDENCE CORRECTIVE --- PASS.**

**POST-MVP R2 --- FINAL PASS / LOCKED.**
