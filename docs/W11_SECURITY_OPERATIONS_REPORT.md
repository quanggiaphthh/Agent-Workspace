# W11 — Security / Operations Hardening Report

## Verdict

**FINAL PASS / LOCKED**

Static/security checkpoint before this report: `bfd417d3d9d90f2bb7a9ca41998801c52a27aefe`.

Canonical GitHub Actions: run #91 (`36010878105`) — **SUCCESS**.

W11 is hardening only. No product feature, Agent runtime, persistence authority, provider, module system, API family, or dependency was added.

## A. Source audit — PASS

Fresh canonical source was audited across:

- Firebase token verification and owner permission resolution;
- Firestore and Storage client boundaries;
- credential encryption and legacy migration behavior;
- server security headers, CSP, body limits and rate limits;
- audit/error secret redaction;
- runtime health and module-persistence fail-closed behavior;
- file-ingestion type/size boundaries;
- dependency audit output and exact installed ADK dependency chain;
- deployment environment, rollback and backup assumptions.

Existing controls were retained wherever already sufficient.

## B. Reuse audit — PASS

W11 reuses:

- Firebase Admin token verification and ADC;
- existing `PermissionResolver`/owner permission baseline;
- existing AES-256-GCM credential protector;
- existing Firestore deny-all rules;
- existing Helmet/rate-limit/request-size controls;
- existing audit redaction utilities;
- existing runtime health policy;
- existing file policy and server-mediated Storage path;
- existing GitHub Actions canonical verification workflow.

No security framework, monitoring platform, auth subsystem or backup subsystem was introduced.

## C. New-code necessity — PASS

Verified gaps and minimum corrections:

1. **Single-owner identity binding gap**  
   Previously every valid Firebase identity received the private app's owner baseline. W11 adds `OWNER_UID`; production now fails closed when it is missing and rejects valid identities that do not match.

2. **Storage Rules source gap**  
   Firestore had deny-all rules but the repository had no canonical Storage rules. W11 adds deny-all `storage.rules` and wires Firestore + Storage rules through `firebase.json`.

3. **Authentication error-detail leakage**  
   Firebase verifier exception details were reflected through the identity error. W11 now logs only a redacted verifier code and returns a deterministic generic authentication error.

4. **Dependency high-severity gate gap**  
   `npm ci` reported high transitive advisories but CI did not distinguish known/reviewed risk from new high-severity regressions. W11 adds `scripts/security-audit.mjs`.

5. **Security regression gate gap**  
   W11 adds a small static project-owned security QA script rather than another test framework.

## D. Test minimization — PASS

Only the existing owner-permission test file was extended for:

- generic token verification failure;
- production missing-owner fail-closed behavior;
- mismatched owner rejection;
- configured owner acceptance.

A single static W11 QA script checks project policy boundaries. Historical full CI remains the milestone regression authority.

## E. Implementation & verification — PASS

W11 commits:

- `01fe328809e839c3d5a739e1fac52ae378116ec1` — introduce production dependency audit gate and expose the existing dependency blocker;
- `68ab8e3136db1624f404f81552c8bf76f3812b2a` — owner allowlist, auth sanitization, Storage rules/config, bounded dependency exception policy and W11 QA;
- `bfd417d3d9d90f2bb7a9ca41998801c52a27aefe` — make `OWNER_UID` mandatory/fail-closed in production.

Run #91 passed:

- clean install;
- production dependency policy;
- production manifest;
- TypeScript;
- targeted file/capability tests;
- full Vitest;
- QA Stage 1–5;
- W11 Security QA;
- production build;
- final manifest verification.

## Dependency risk decision

`@google/adk@2.1.0` currently resolves `adm-zip@0.5.18`. npm reports high ZIP-processing advisories. A forced npm remediation would downgrade ADK and reopen the already verified native ADK/runtime integration.

Current application reachability is bounded:

- ZIP is not an accepted upload MIME type;
- RootAgent does not enable an ADK skills loader;
- the reviewed vulnerable ZIP path is therefore not exposed through current app-owned inputs.

CI allows only the three reviewed `adm-zip` advisory IDs, only on the reviewed dependency/version path, and only through 2026-10-31. New high/critical risk fails the gate. This is a temporary risk acceptance, not a claim that the dependency itself is vulnerability-free.

## W12 release gates carried forward

W12 must not release until it verifies the deployment environment actually has:

- `NODE_ENV=production`;
- correct `OWNER_UID` for the sole owner;
- stable `CREDENTIAL_ENCRYPTION_KEY` and key ID where personal credentials are used;
- valid Firebase Admin ADC/IAM;
- required Gemini credential(s);
- deployed Firestore deny-all rules;
- deployed Storage deny-all rules;
- healthy persistence endpoints;
- live end-to-end smoke/UAT after deployment.

W12 must also record deployed/previous known-good commits and remember that source rollback does not roll back stored data.

## Change metrics

- New runtime dependencies: **0**
- New business APIs: **0**
- New persistence/schema migrations: **0**
- New auth framework: **0**
- New monitoring framework: **0**
- New Security Rules file: **1** (`storage.rules`)
- New deployment config file: **1** (`firebase.json`)
- New security scripts: **2**
- Existing production auth file modified: **1**
- Existing unit-test file extended: **1**

## Next

**W12 — UAT / Deployment / Release**.

Only W12 may declare **MVP FINAL PASS / LOCKED**.
