# AGENT-WORKSPACE --- POST-R2 FRESH REPOSITORY AUDIT + BACKLOG TRIAGE

**Audit type:** source/config/documentation audit only\
**Canonical repository:** `quanggiaphthh/Agent-Workspace`\
**Fresh canonical HEAD:** `e3157f9d51064ff0aab94e2d5b3e9ddc4f33c39d`\
**Audit date:** 2026-09-25\
**Production/code changes performed:** 0\
**Tests/build/deploy performed:** 0

## Executive Verdict

Fresh canonical `main` is identical to the supplied canonical HEAD
`e3157f9d51064ff0aab94e2d5b3e9ddc4f33c39d`.

The audit did **not** identify a confirmed blocker, trust-boundary
break, R1/R2 regression, data-integrity defect in the active Agent/Task
paths, or reliability issue severe enough to justify reopening
production implementation immediately.

The repository still carries several understood debts. Most are
appropriate to **ACCEPT** or **DEFER** for the current product boundary:
one owner, private/personal deployment, no team/org/billing/marketplace.
A small repository-hygiene cluster is suitable for a future non-urgent
batch, but it does not justify opening R3 by itself.

**Decision: A --- NO R3 REQUIRED NOW.**

The only item that merits an explicit future correctness trigger is the
bulk user-data deletion implementation: it builds one Firestore WriteBatch
for all matched documents in each collection. This creates a batch-size
scalability ceiling. The fresh audit did not establish that the current
owner dataset reaches the applicable SDK/backend batch-write limit or that
this path is presently failing. It is therefore **PROBABLE / DEFER with a
hard trigger**, not FIX NOW.

## Canonical Baseline

-   MVP --- **FINAL PASS / LOCKED**
-   R1 --- **FINAL PASS / LOCKED**
-   R2 --- **FINAL PASS / LOCKED**
-   R2 canonical closeout --- **COMPLETE**
-   H1 cleanup closeout --- **COMPLETE**
-   R2 implementation checkpoint:
    `83e6c8940f21d43c3d791446f0d8017f65b866cd`
-   R2 implementation CI: run #152 / `36089895220` / SUCCESS
-   R2 closeout-baseline CI: run #156 / `36097654993` / SUCCESS
-   Full Vitest at closeout baseline: 400/400 PASS
-   R3 --- **NOT OPENED**
-   Fresh `main` comparison against `e3157f9d...`: identical; no
    post-baseline drift.

## Audit Coverage

Fresh source/configuration was inspected across:

-   runtime/server composition, Express lifecycle, routing, health, API
    fallback, request cancellation and process failure behavior;
-   Firebase identity verification, `OWNER_UID`, permissions and
    server/client authority boundaries;
-   Agent SSE/cancellation/deadline surfaces and the locked R1/R2 seams;
-   Task persistence, pagination, exact-title resolution, stats and
    module-state enforcement;
-   memory persistence/search behavior;
-   credential protection and key-version handling;
-   package metadata, npm/Bun lockfiles and Vite configuration;
-   production diagnostic-route guard;
-   repository README/template remnants;
-   known ADK → `adm-zip` exception context.

No full test, build, deploy or live smoke was run.

## Findings

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  ID         Severity     Confidence    Area                   Finding                                 Evidence                                                                                       Disposition
  ---------- ------------ ------------- ---------------------- --------------------------------------- ---------------------------------------------------------------------------------------------- -------------
  F01        Low          IMPROVEMENT   Runtime                Server port is hard-coded to `3000`     `server.ts`: `const PORT = 3000`; current AI Studio wrapper is already known to forward hosted ACCEPT
                                                               instead of consuming `PORT`.            ingress correctly.                                                                             

  F02        Low          IMPROVEMENT   Maintainability        `server.ts` remains an oversized        `server.ts` imports/defines the majority of server composition in one file;                    DEFER
                                                               composition root containing middleware, `server/bootstrap.ts` already provides a local bootstrap primitive.                            
                                                               schemas, AI routes, Agent route,                                                                                                       
                                                               capabilities, audit, modules and static                                                                                                
                                                               serving.                                                                                                                               

  F03        Low          IMPROVEMENT   Auth/Typing            Request identity/request metadata still `server.ts` auth middleware, permission middleware, AI routes, capability routes and module    RESOLVED /
                                                               rely on repeated `(req as any).user` /  routes.                                                                                        STALE
                                                               `(req as any).requestId` casts.                                                                                                        

  F04        Info         CONFIRMED     Package metadata       Package is still named `react-example`  `package.json`, `package-lock.json`, `bun.lock`.                                               RESOLVED /
                                                               version `0.0.0`.                                                                                                                       STALE

  F05        Info         CONFIRMED     Dependencies/Build     `vite` is declared in both              `package.json`.                                                                                RESOLVED /
                                                               `dependencies` and `devDependencies` at                                                                                                STALE
                                                               the same `^6.2.3` range. This is                                                                                                       
                                                               metadata duplication, not evidence of                                                                                                  
                                                               two runtime Vite versions.                                                                                                             

  F06        Low          CONFIRMED     Lockfile authority     Both `package-lock.json` and `bun.lock` repository root; both lockfiles identify the same `react-example` workspace.                   RESOLVED /
                                                               are tracked. Canonical CI has been                                                                                                     STALE
                                                               npm-oriented, but two generated lock                                                                                                   
                                                               authorities can drift if both are                                                                                                      
                                                               maintained manually.                                                                                                                   

  F07        Info         CONFIRMED     Documentation          Root README remains the AI Studio       `README.md`: "Run and deploy your AI Studio app", generic local steps.                         RESOLVED /
                                                               starter/template README and does not                                                                                                   STALE
                                                               describe current Agent-Workspace                                                                                                       
                                                               architecture, canonical npm workflow or                                                                                                
                                                               security/deployment constraints.                                                                                                       

  F08        Low          CONFIRMED     Memory/Persistence     Memory search performs Firestore        `server/core/data/UserDataService.ts::listMemories`.                                           DEFER
                                                               owner/status/category filtering, then                                                                                                  
                                                               substring matching in process and                                                                                                      
                                                               slices results to max 100. The database                                                                                                
                                                               read itself is not query-bounded by the                                                                                                
                                                               requested result limit.                                                                                                                

  F09        Low          CONFIRMED     Credential security    Credential payload stores `keyId`, but  `server/core/ai/credentialSecretProtector.ts::EnvAesGcmCredentialSecretProtector.unprotect`.   DEFER
                                                               decrypt accepts only the currently                                                                                                     
                                                               configured key ID/key; there is no                                                                                                     
                                                               multi-key decryption ring.                                                                                                             

  F10        Medium       CONFIRMED     Dependency security    Known transitive exception remains      canonical dependency-exception context; no audit evidence that ZIP/skills-loader exposure has  ACCEPT
             (accepted                                         `@google/adk@2.1.0 → adm-zip@0.5.18`.   been enabled.                                                                                  
             dependency                                        Current product does not accept ZIP and                                                                                                
             risk)                                             ADK skills loader is not enabled.                                                                                                      

  F11        Info         CONFIRMED     Runtime/Operations     Server does not install an explicit     `server.ts::startServer`; process handlers cover `unhandledRejection` and `uncaughtException`, DEFER
                                                               `SIGTERM`/`SIGINT` graceful-shutdown    not termination signals.                                                                       
                                                               handler; `app.listen()` handle is not                                                                                                  
                                                               retained for draining.                                                                                                                 

  F12        Low          CONFIRMED     Operations/Security    Public `/api/health` executes           `server.ts`: `/api/health` plus global `limiter`.                                              ACCEPT
                                                               Firestore, session and audit health                                                                                                    
                                                               probes on every call. Global `/api`                                                                                                    
                                                               rate limiting mitigates abuse.                                                                                                         

  F13        Medium if    PROBABLE      Persistence/Data       `deleteAllUserData` currently builds a single Firestore WriteBatch for all matched documents in each collection. This creates a batch-size scalability ceiling. The fresh audit did not establish that the current owner dataset reaches the applicable SDK/backend limit or that deletion currently fails.    `server/core/data/UserDataService.ts::deleteAllUserData`; one `adminFirestore.batch()` per full collection snapshot.    DEFER
             threshold                  deletion
             reached

  F14        Info         CONFIRMED     Security/Diagnostics   Historical Firebase diagnostic route    `server/core/auth/identityProvider.ts::getIdentity` checks production                          RESOLVED /
                                                               still exists in `server.ts`, but        `/test/firebase-connection` before token handling.                                             STALE
                                                               production access is explicitly                                                                                                        
                                                               rejected at the shared identity                                                                                                        
                                                               boundary with 404.                                                                                                                     

  F15        Info         CONFIRMED     Routing                Historical SPA/API fallback concern is  `server.ts`: `app.use('/api', ... API_ROUTE_NOT_FOUND)` precedes static/Vite handling.         RESOLVED /
                                                               resolved: `/api` misses return JSON 404                                                                                                STALE
                                                               before static SPA catch-all.                                                                                                           
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Detailed Impact / Mitigation / Reuse Notes

### F01 --- hard-coded port

**Impact:** portability only. The currently proven AI Studio deployment
wrapper maps hosted ingress to local port 3000.\
**Likelihood:** low while deployment remains on the current wrapper.\
**Blast radius if changed incorrectly:** server startup/deployment.\
**Existing mitigation:** proven live deployment mapping.\
**Reuse:** if portability becomes required, reuse existing environment
parsing conventions; no new runtime authority is needed.\
**Trigger:** deployment outside current AI Studio wrapper or evidence
that wrapper no longer forwards correctly.

### F02 --- composition-root size

**Impact:** change-review cost and accidental coupling, not current
runtime correctness.\
**Likelihood:** maintainability cost grows with new modules.\
**Blast radius of refactor:** high because `server.ts` is central.\
**Mitigation:** locked architecture authorities already exist in
dedicated services; `server/bootstrap.ts` already separates registry
bootstrap.\
**Reuse:** extract route registration around existing authorities; do
not create new service authorities.\
**Decision rationale:** defer until a real feature/corrective requires
touching multiple server sections.

### F03 --- Express request typing

**Impact:** compile-time safety and readability. No evidence of auth
bypass because identity is assigned centrally before protected API
routes.\
**Blast radius:** low if solved with local Express request
augmentation/helper.\
**Reuse:** `UserContext` already exists in shared contracts.\
**Minimum new code:** a single request type augmentation/helper, then
removal of casts only where touched.

### F04--F07 --- repository hygiene cluster

These are real repository inconsistencies but not production defects.
They can be corrected together in a bounded
**documentation/package-metadata-only** batch: - rename package
metadata; - decide and document one canonical lockfile authority; -
remove duplicate Vite declaration without changing resolved version; -
replace starter README with Agent-Workspace instructions.

This cluster must not opportunistically upgrade dependencies.

### F08 --- Memory search

**Impact:** reads all owner memories matching server-side equality
filters before local substring filtering. Cost/latency scales with
memory count; result output is still bounded to 100.\
**Likelihood:** low for current personal MVP volume.\
**Blast radius:** Memory only.\
**Existing mitigation:** single owner; optional status/category
Firestore filters; output limit.\
**Reuse:** defer until Memory volume demonstrates a problem or the
planned Research/RAG/vector work is explicitly opened. Do not build a
search subsystem solely for this finding.

### F09 --- encryption key ring

**Impact:** rotating `CREDENTIAL_ENCRYPTION_KEY_ID`/key without
preserving the old decrypt key makes existing protected credentials
undecryptable.\
**Likelihood:** low while the current key is preserved as required by
operations documentation.\
**Blast radius:** stored personal AI credentials.\
**Existing mitigation:** key ID is persisted; operations already require
preserving encryption key/key ID.\
**Reuse:** current `CredentialSecretProtector` interface is the
extension seam; a future key ring should extend this authority rather
than create a parallel secret store.\
**Trigger:** planned key rotation, key compromise, KMS migration, or
multiple active encryption keys.

### F10 --- ADK / adm-zip

**Impact:** accepted transitive advisory exposure.\
**Current mitigation:** no ZIP input; ADK skills loader disabled;
dependency security policy already recognizes the exception.\
**Review deadline:** **31/10/2026**.\
**Immediate re-audit triggers:** ADK upgrade; ZIP upload enabled; skills
loader enabled; dependency graph changed.\
**Decision:** ACCEPT until a trigger/deadline. Do not use
`npm audit fix --force`.

### F11 --- graceful shutdown

**Impact:** in-flight work may be interrupted on process termination
rather than explicitly drained.\
**Likelihood:** low in current single-owner environment and no runtime
failure evidence was found.\
**Blast radius:** in-flight HTTP/SSE only during termination.\
**Reuse:** retain the `app.listen()` server handle and existing
cancellation/deadline primitives if this becomes necessary.\
**Trigger:** observed interrupted writes/streams during redeploy,
migration to a deployment contract that requires explicit draining, or
increased concurrent use.

### F12 --- deep public health probe

**Impact:** each health request performs real backend probes; could
consume reads/work if hammered.\
**Mitigation:** global `/api` rate limiter; private one-owner product;
health route intentionally unauthenticated for operations.\
**Decision:** ACCEPT for current phase.

### F13 --- bulk deletion batch ceiling

**Impact:** `deleteAllUserData()` currently builds a single Firestore
WriteBatch for all matched documents in each collection. This creates a
batch-size scalability ceiling as owner data grows.

**Likelihood:** unknown; the fresh audit did not establish that the
current owner dataset reaches the applicable SDK/backend batch-write limit
or that production deletion currently fails.

**Blast radius:** user-data deletion operation only; normal Task/Memory
CRUD is unaffected.

**Existing mitigation:** current personal dataset may remain below the
applicable batch-size limit; no delete-all failure evidence was
established.

**Reuse:** extend `UserDataService` with bounded chunking/bulk-writer
semantics if the trigger is met; do not add a new persistence authority.

**Trigger:** dataset approaching the applicable Firestore batch-write
limit; reproduced delete-all failure attributable to batch size; or
significant owner-data growth making single-batch deletion unsafe.

### F14--F15 --- resolved historical findings

Production diagnostic exposure and API-to-SPA fallback are not current
findings. They remain in the audit only to prevent stale backlog items
from being reopened.

## Known Debt Reassessment

  -----------------------------------------------------------------------
  Known debt              Fresh assessment        Disposition
  ----------------------- ----------------------- -----------------------
  hard-coded `PORT=3000`  still present; accepted ACCEPT
                          by current wrapper      
                          contract                

  `server.ts`             still present;          DEFER
  composition-root        maintainability only    
  monolith                                        

  `(req as any).user`     still present           NEXT BATCH

  package name            still present           NEXT BATCH
  `react-example`                                 

  historical Vite         duplicate declaration   NEXT BATCH
  duplicate dependency    confirmed; no evidence  
  concern                 of duplicate runtime    
                          versions from this      
                          declaration alone       

  `bun.lock` +            both still tracked      NEXT BATCH
  `package-lock.json`                             

  README template         confirmed               NEXT BATCH
  remnants                                        

  bounded substring       confirmed; output       DEFER
  Memory search           bounded, DB read not    
                          result-bounded          

  credential encryption   confirmed               DEFER
  lacks multi-key ring                            

  ADK → `adm-zip@0.5.18`  accepted under current  ACCEPT
  advisory                exposure assumptions;   
                          deadline/triggers       
                          retained                
  -----------------------------------------------------------------------

## Resolved / Stale Findings

1.  **Production Firebase diagnostic exposure --- RESOLVED/STALE.**
    Route source remains for non-production diagnostics, but
    `ServerIdentityProvider.getIdentity()` returns 404 for
    `/test/firebase-connection` in production.
2.  **Unknown authenticated API route falling through to SPA ---
    RESOLVED/STALE.** JSON `API_ROUTE_NOT_FOUND` middleware precedes
    static/SPA handling.
3.  No fresh evidence was found that reopens R1 Agent/Task trust, HITL,
    replay, idempotency, Task ambiguity, stats, SSE, cancellation or R2
    provider-timeout findings.

## FIX NOW

**None.**

No confirmed issue meets the threshold for immediate production
modification in the current single-owner private deployment.

## NEXT BATCH

Recommended only as a **non-urgent repository hygiene batch**, not R3:

-   F03 Express request typing;
-   F04 package metadata;
-   F05 duplicate Vite declaration;
-   F06 lockfile authority;
-   F07 README replacement.

The package/lockfile portion must preserve exact dependency resolution
unless separately approved.

## DEFER

-   F02 composition-root decomposition;
-   F08 Memory search scalability;
-   F09 multi-key credential decryption ring;
-   F11 explicit graceful shutdown;
-   F13 bulk deletion batch-size handling until applicable-limit/reproduction
    evidence.

## ACCEPT

-   F01 hard-coded port under current AI Studio ingress wrapper;
-   F10 ADK → adm-zip exception until deadline/trigger;
-   F12 public deep health probe under current limiter/private-product
    assumptions.

## Workstream Clustering

### Cluster H1 --- Repository hygiene and type safety

**Objective:** remove low-risk repository ambiguity without changing
product behavior.

**Findings:** F03, F04, F05, F06, F07.\
**Likely files:** `package.json`, chosen lockfile policy/artifact,
`README.md`, a small Express request typing declaration/helper, touched
`server.ts` casts only.\
**Local reuse:** `UserContext`, current npm scripts, existing canonical
docs.\
**Dependencies:** none new.\
**Minimum new code:** one small request-typing seam; otherwise
metadata/docs cleanup.\
**Existing tests reusable:** TypeScript/noEmit, canonical
manifest/dependency policy, existing server tests.\
**Minimum new tests:** normally none for README/package name/lock
authority; request typing should be proven by TypeScript and existing
auth tests unless behavior changes.\
**Runtime/live impact:** none intended.\
**Risk:** Low.

### Cluster RUNTIME-PORTABILITY --- deferred

**Objective:** improve deployment portability/lifecycle only when a
trigger exists.

**Findings:** F01, F11.\
**Likely files:** `server.ts`, environment example, deployment docs.\
**Local reuse:** existing env parsing patterns, request
cancellation/deadline primitives.\
**Dependencies:** none.\
**Minimum new code:** environment port parsing + server-handle shutdown
path.\
**Tests:** focused startup/config/lifecycle tests only if opened.\
**Runtime/live impact:** server startup/shutdown; live verification
required because ingress is deployment-sensitive.\
**Risk:** Medium due to deployment blast radius.\
**Status:** do not open now.

### Cluster DATA-SCALE --- deferred

**Objective:** address scale thresholds only when current personal data
justifies them.

**Findings:** F08, F13.\
**Likely files:** `server/core/data/UserDataService.ts` and focused
tests.\
**Local reuse:** current Firestore authority and pagination patterns.\
**Dependencies:** none.\
**Minimum new code:** bounded/chunked deletion and/or bounded memory
retrieval strategy.\
**Runtime/live impact:** Memory search or delete-all only.\
**Risk:** Low/Medium.\
**Status:** trigger-driven; do not open now.

### Cluster CREDENTIAL-ROTATION --- deferred

**Objective:** safe multi-key decrypt/re-encrypt when rotation becomes a
real requirement.

**Finding:** F09.\
**Likely files:** `credentialSecretProtector.ts`,
`CredentialService.ts`, environment/deployment docs, focused tests.\
**Local reuse:** extend `CredentialSecretProtector`; keep one credential
authority.\
**Dependencies:** none unless an explicitly approved KMS migration
occurs.\
**Minimum new code:** key-ID-to-key resolver and migration path.\
**Runtime/live impact:** credential reads/updates.\
**Risk:** Medium/High because credentials are sensitive.\
**Status:** do not open without rotation requirement.

## Recommended Next Workstream

**No production workstream is recommended now.**

If maintenance time is intentionally allocated, run **H1 --- Repository
hygiene and type safety** as a bounded non-behavioral batch. It should
not be labeled R3 unless project governance explicitly chooses to make
repository hygiene a numbered post-MVP production workstream.

Priority triggers that would supersede H1:

1.  reproduced security/trust-boundary issue;
2.  reproduced correctness/data-integrity issue;
3.  dataset approaching the applicable Firestore batch-write limit before
    delete-all use, or significant owner-data growth making single-batch
    deletion unsafe;
4.  deployment migration away from the current AI Studio ingress
    wrapper;
5.  encryption-key rotation;
6.  ADK/ZIP/skills-loader/dependency trigger for the `adm-zip`
    exception.

## Test Strategy for Next Workstream

If H1 is approved later:

1.  source diff gate: only intended metadata/docs/type files;
2.  package resolution must remain unchanged unless explicitly approved;
3.  TypeScript/noEmit;
4.  reuse existing auth/server tests for request typing;
5.  dependency-policy/manifest verification if lock/package metadata
    changes;
6.  no new behavioral test unless implementation changes runtime
    behavior;
7.  no live smoke required for README/package-name-only changes; if
    server typing is compile-time only, existing CI is sufficient.

This audit itself ran no test/build/deploy command.

## R3 Decision

### A --- NO R3 REQUIRED NOW

Rationale:

-   zero FIX NOW findings;
-   no fresh R1/R2 regression evidence;
-   current security and authority boundaries remain intact in inspected
    source;
-   remaining debt is either accepted under the actual one-owner
    deployment, trigger-driven, or low-risk repository hygiene;
-   opening R3 now would create more production-change risk than user
    value.

## Stop Condition

Audit and triage complete.

STOP: - no production/source modification; - no test modification; - no
dependency update; - no commit/push; - no deploy/live smoke; - no R3
implementation.

**VERDICT: POST-R2 FRESH AUDIT --- READY FOR CHECKER**
