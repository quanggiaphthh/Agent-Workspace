# AGENT-WORKSPACE — POST-H1 FRESH AUDIT AND NEXT-WORKSTREAM GATE

**Audit type:** static/source/documentation revalidation only  
**Canonical repository:** `quanggiaphthh/Agent-Workspace`  
**Fresh canonical HEAD:** `c258392e58a8739ed1f76a6fdaaccd73c8b5aa00`  
**Audit date:** 2026-09-25  
**Production changes:** 0  
**Test changes:** 0  
**Full regression/build/deploy:** not run

## 1. Fresh canonical state

Fresh `main` was read directly rather than accepting an AI Studio SHA as authority.

Canonical documentation establishes:

- MVP — **FINAL PASS / LOCKED**
- R1 — **FINAL PASS / LOCKED**
- R2 — **FINAL PASS / LOCKED**
- H1 — **FINAL PASS / LOCKED**
- R3 — **NOT OPENED**
- Tracker next gate — none; all currently approved workstreams are closed.

The H1 closeout commit is documentation/repository-hygiene closeout and does not replace the locked R2 implementation checkpoint.

## 2. H1 post-closeout sanity audit

### F03 — Express request typing

**PASS / RESOLVED.**

`server/types/express.d.ts` augments `Express.Request` with the intentionally optional canonical fields:

- `user?: UserContext`
- `requestId?: string`

`UserContext` is reused from `shared/contracts/capability`; no duplicate identity type was introduced.

`server.ts` retains the public boundary for `/api/health` and `/api/log-error`, then runs the shared identity middleware for protected `/api` paths. `requireAuthenticatedUser(req)` is a minimum local narrowing primitive: it reads `req.user`, fails closed with 401 if the authenticated invariant is unexpectedly absent, and does not create or resolve an alternative identity.

Existing `requirePermission()` still performs its explicit missing-user 401 guard and permission resolution. `/api/audit` retains its existing guard. The Firebase diagnostic route retains optional diagnostic access. No parallel authentication authority was found.

### F04 — package name

**PASS / RESOLVED.**

`package.json` and root package metadata in `package-lock.json` use `agent-workspace`.

### F05 — Vite declaration

**PASS / RESOLVED.**

`vite` is present only in `devDependencies` at `^6.2.3`; the former duplicate runtime declaration is gone.

### F06 — package-manager / lock authority

**PASS / RESOLVED.**

`package-lock.json` is the canonical npm lock. `bun.lock` is absent from fresh HEAD. No H1 dependency upgrade was required by this cleanup.

### F07 — README

**PASS WITH DOCUMENTATION NOTE.**

The starter AI Studio README was replaced by an Agent-Workspace-specific README describing the single-owner scope, architecture authorities, npm workflow and security boundary.

A minor status wording inconsistency remains: README lists MVP/R1/R2 and R3 state but does not list `H1 — FINAL PASS / LOCKED`; instead it says “H1 is repository maintenance”. This does not alter runtime or governance because Master Plan and Tracker are the status authorities.

### H1 regression / authority review

No confirmed H1-created auth weakening, runtime authority duplication, dependency drift, or production behavior regression was found by static inspection.

The previously observed intermediate archive `Agent-Workspace-H1-F03-integrated-working-tree.tar.gz` is no longer present in the fresh canonical closeout state. That observation is therefore **RESOLVED / STALE** and does not require an H1 corrective.

## 3. Remaining backlog revalidation

| ID | Fresh classification | Fresh disposition | Revalidation |
|---|---|---|---|
| F01 PORT | IMPROVEMENT | ACCEPT | `PORT=3000` remains. Master Plan records current AI Studio ingress forwarding as proven. No new deployment-contract evidence makes this operationally broken. |
| F02 server.ts composition root | IMPROVEMENT | DEFER | Still large, but no fresh correctness/security/testability blocker was established. Do not refactor for size alone. |
| F08 Memory search | CONFIRMED | DEFER | Firestore owner/status/category filtering is followed by in-process substring filtering and result slicing. No dataset-growth, latency, memory, correctness or product-search trigger was established. |
| F09 credential multi-key ring | CONFIRMED | DEFER | Protected payload carries `keyId`, while the current protector decrypts only with the configured active key/key ID. No rotation/migration/KMS trigger was established. |
| F10 ADK → adm-zip | CONFIRMED | ACCEPT WITH REVIEW DEADLINE | Canonical dependency declaration remains `@google/adk ^2.0.0`; prior canonical audit recorded the resolved chain as ADK → adm-zip. No evidence shows ZIP upload or ADK skills loader became enabled after H1. Review remains due 31/10/2026. See security note below. |
| F11 graceful shutdown | CONFIRMED | DEFER | `server.ts` still has fatal-process handlers but no explicit SIGTERM/SIGINT drain contract. No current deployment/runtime evidence establishes a required graceful-drain behavior or reproduced interruption. |
| F12 public `/api/health` | CONFIRMED | ACCEPT | Health remains intentionally public and rate-limited; response is derived health state plus capability count, not secrets. Deep backend probes remain appropriate for current private single-owner operations. |
| F13 bulk deletion scalability | PROBABLE | DEFER | `deleteAllUserData()` still constructs one Firestore batch per complete owner collection snapshot. No reproduced failure, applicable-threshold proximity, or owner-data growth trigger was established. |

### F10 current advisory note

Fresh public advisory evidence has become stronger since the original post-R2 audit:

- GitHub Advisory Database now records **CVE-2026-77301 / GHSA-7q85-xj36-vmfc**, high severity, affecting `adm-zip < 0.6.1`, patched in `0.6.1`, for uncontrolled allocation from crafted ZIP metadata.
- A separate reviewed advisory, **CVE-2026-76845 / GHSA-vwc7-r8mq-g2x9**, covers symlink-following extraction behavior in `adm-zip >=0.5.9 <=0.6.0`.

This increases the importance of the already-scheduled F10 review, but it does **not by itself prove a reachable vulnerability in Agent-Workspace**. Fresh source evidence did not establish that arbitrary ZIP ingestion or the ADK skills loader is enabled. Therefore F10 is not escalated to R3 or FIX NOW in this audit. Immediate escalation trigger remains any reachable untrusted ZIP-processing path, skills-loader enablement, or dependency-graph change.

## 4. New findings

### N01 — intermediate H1 archive

- **Classification:** RESOLVED / STALE
- **Disposition:** RESOLVED / STALE
- **Freshness corrective:** the fresh canonical closeout state has removed `Agent-Workspace-H1-F03-integrated-working-tree.tar.gz`.
- **Impact:** none remaining.
- **Trigger:** inactive.

### N02 — README H1 status wording lags canonical status

- **Classification:** IMPROVEMENT
- **Area:** documentation consistency
- **Disposition:** DEFER
- **Evidence:** fresh README status lists MVP/R1/R2 and `R3 — NOT REQUIRED / NOT OPENED`, then states that H1 is repository maintenance, but does not explicitly state `H1 — FINAL PASS / LOCKED`.
- **Authority assessment:** README is developer/operator orientation; Master Plan and Tracker remain canonical status authorities. This wording gap is not a governance contradiction.
- **Impact:** low; no runtime, security, correctness, or canonical-governance impact.
- **Trigger for later cleanup:** README is otherwise being edited, or a documentation consistency batch is explicitly opened.

No new security/trust-boundary, correctness/data-integrity, severe reliability, triggered scalability, or operational finding was established.

## 5. Classification / disposition matrix

| Item | Classification | Disposition |
|---|---|---|
| F01 | IMPROVEMENT | ACCEPT |
| F02 | IMPROVEMENT | DEFER |
| F03 | — | RESOLVED/STALE |
| F04 | — | RESOLVED/STALE |
| F05 | — | RESOLVED/STALE |
| F06 | — | RESOLVED/STALE |
| F07 | — | RESOLVED/STALE |
| F08 | CONFIRMED | DEFER |
| F09 | CONFIRMED | DEFER |
| F10 | CONFIRMED | ACCEPT WITH REVIEW DEADLINE |
| F11 | CONFIRMED | DEFER |
| F12 | CONFIRMED | ACCEPT |
| F13 | PROBABLE | DEFER |
| N01 | — | RESOLVED/STALE |
| N02 | IMPROVEMENT | DEFER |

### Counts

Counts below cover the current revalidated matrix; resolved/stale items are counted only in that disposition, not as active Confirmed/Probable/Improvement findings.

- Confirmed: **5** (`F08`, `F09`, `F10`, `F11`, `F12`)
- Probable: **1** (`F13`)
- Improvement: **3** (`F01`, `F02`, `N02`)
- Fix Now: **0**
- Next Batch: **0**
- Defer: **5** (`F02`, `F08`, `F09`, `F11`, `N02`) plus probable `F13`
- Accept: **3** (`F01`, `F10` with deadline, `F12`)
- Resolved/Stale: **6** (`F03`–`F07`, `N01`)

## 6. Trigger matrix

| Item | Trigger that changes disposition |
|---|---|
| F01 | deployment outside current wrapper; ingress mapping changes/fails |
| F02 | demonstrated correctness/security coupling, testability blocker, or recurring multi-section server changes |
| F08 | meaningful owner-memory growth; measured latency/memory issue; correctness limitation; explicit advanced-search/RAG requirement |
| F09 | key rotation, compromise, credential migration, KMS move, or multiple active decrypt keys |
| F10 | 31/10/2026 review deadline; ADK/dependency update; ZIP input enabled; skills loader enabled; any reachable untrusted ZIP processing |
| F11 | deployment contract requires draining; reproduced interrupted write/SSE during termination; materially higher concurrency |
| F12 | secret/internal detail appears in response, abuse cost becomes material, or operations contract changes |
| F13 | reproduced batch-size deletion failure; dataset approaches applicable backend limit; significant owner-data growth |
| N01 | inactive: intermediate archive has been removed from fresh canonical closeout state |
| N02 | optional documentation cleanup when README is next edited or a documentation-consistency batch is explicitly opened |

## 7. Next-workstream decision

**A — NO NEW WORKSTREAM.**

After the freshness corrective:

- there is no FIX NOW item;
- no security/trust regression was established;
- no correctness/data-integrity issue was established;
- no reproduced reliability failure was established;
- no scalability or operational trigger has fired;
- N01 is resolved/stale;
- N02 is a low-priority documentation improvement and README is not the canonical status authority.

Therefore opening a maintenance workstream solely to change README wording would not meet the next-workstream gate.

**R3 — NOT REQUIRED / NOT OPENED.**

F10 retains its review deadline of **31/10/2026**, with earlier review only if its existing trigger conditions change.

## 8. Recommended next action

Keep production stable and open no successor workstream now.

Operationally:

1. leave F01/F02/F08/F09/F11/F13 at their current ACCEPT/DEFER dispositions until their documented triggers occur;
2. retain F10 review no later than **31/10/2026**, or earlier if ADK/dependency, ZIP-processing, or skills-loader conditions change;
3. treat N02 as optional documentation cleanup during a future documentation edit rather than a standalone workstream.

## 9. Explicit non-goals

- no R3;
- no production/runtime implementation;
- no PORT change;
- no `server.ts` decomposition;
- no Memory RAG/vector/search redesign;
- no credential key-ring redesign;
- no ADK/dependency upgrade in this audit;
- no graceful-shutdown implementation;
- no health-route redesign;
- no Firestore deletion chunking without trigger;
- no tests, dependency/config changes, commit, push or deploy;
- no Master Plan/Tracker modification.

## Verdict

**POST-H1 FRESH AUDIT CORRECTIVE — READY FOR CHECKER**
