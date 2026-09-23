# AGENT-WORKSPACE --- MVP EXECUTION PHASES

> **Authority:** detailed implementation decomposition for the remaining
> MVP.\
> Scope/order/reuse policy: `MVP_COMPLETION_PLAN_REUSE_FIRST.md`.\
> Operational status: `MVP_IMPLEMENTATION_TRACKER.md`.\
> Historical checkpoints: `../PROJECT_MASTER_PLAN.md`.

## 1. Shared phase contract

Every phase/lượt uses:

**Pre-code gates:** A SOURCE AUDIT; B REUSE AUDIT; C NEW-CODE NECESSITY
PROOF; D TEST MINIMIZATION PLAN; E IMPLEMENTATION PLAN.

**Common stop conditions:** second canonical authority/runtime;
unsupported/private seam; bypass of locked gateway/Runner; scope
expansion into post-MVP; production code before A--E; requirement for an
unapproved dependency without reuse/net-code proof.

**Common checkpoint:** candidate ZIP/source diff → checker → required
live/runtime verification → canonical CI → lock. Documentation-only
gates do not create production checkpoints.

## 2. Dependency DAG

`L3B-0 → L3B-1 → L3B-2 → L3B-3 → L3C-0 → L3C-1 → L3C-2 → L3C-3 → L3D → W4A → W4B → W4C → W4D → W5 → W6 → W7 → W8A → W8B → W8C → W8D → W8E → W9 → W10 → W11 → W12`

After W4D, read-only UX discovery may run in parallel, but shared
production changes follow the canonical order above.

## 3. M1 --- Document → Agent

### L3B-0 --- EXACT ADK REUSE GATE

**Milestone:** M1. **Status:** NEXT. **Depends on:** L3A locked.\
**User outcome:** none yet; architecture is proven safe before code.\
**Scope:** exact installed ADK source/types;
Runner/artifactService/native loading seam; compatibility with current
sessions/events/SSE/cancellation.\
**Reuse targets:** installed `@google/adk`; official native artifact
APIs; upstream source only as comparison.\
**Authorities touched:** read-only audit of ADK runtime, UserFileService
boundary.\
**Files/responsibilities expected:** planning/report only; no production
files.\
**Pre-code gates:** complete A--E for L3B.\
**Application-owned tests:** plan only. **Locked regressions:** identify
GĐ2/GĐ3/L3A suites.\
**Runtime/live verification:** not required in this gate.\
**Non-goals:** implementation; composer UX; full E2E.\
**Stop conditions:** unsupported/private/incompatible seam; architecture
requires Runner bypass or second runtime/authority.\
**Exit gate:** explicit reuse decision + necessity proof + minimized
test plan + implementation file plan approved for L3B-1/2.\
**Deliverable:** L3B design/reuse-gate candidate. **Next:** L3B-1.

### L3B-1 --- RUN-SCOPED ARTIFACT BRIDGE

**Milestone:** M1. **Depends on:** L3B-0 approved.\
**User outcome:** authorized current-turn file can be represented to
native ADK without becoming durable history.\
**Scope:** thin adapter; current-run whitelist; safe filename/MIME
mapping; lazy bounded read; AbortSignal.\
**Reuse targets:** L3A attachment service/UserFileService/BinaryStore +
native ADK artifact contract.\
**Authorities touched:** UserFileService remains sole file authority.\
**Files/responsibilities expected:** only server Agent/file integration
boundary proven by L3B-0.\
**Pre-code gates:** reference L3B-0 A--E; refresh A if HEAD moved.\
**Application-owned tests:** whitelist; same-owner
unattached/foreign/stale; bounds; abort; safe mapping; no durable
binary/base64.\
**Locked regressions:** L3A + chat cancellation/history.\
**Runtime/live verification:** not yet required beyond integration-level
evidence.\
**Non-goals:** Runner wiring if separable; composer; new file
capability.\
**Stop conditions:** adapter grows into artifact framework or file
authority.\
**Exit gate:** targeted boundary tests pass; checker source audit
accepts thinness/fail-closed semantics.\
**Deliverable:** candidate checkpoint. **Next:** L3B-2.

### L3B-2 --- NATIVE ADK INTEGRATION

**Milestone:** M1. **Depends on:** L3B-1.\
**User outcome:** current-turn artifact reaches model invocation through
supported ADK path.\
**Scope:** Runner/artifactService/native `LoadArtifactsTool` or
exact-version equivalent wiring; preserve session/events/SSE/HITL.\
**Reuse targets:** exact installed ADK.\
**Authorities touched:** ADK remains sole Agent runtime.\
**Application-owned tests:** adapter-to-native seam, no Runner bypass,
no durable media history, cancellation propagation.\
**Locked regressions:** GĐ2/GĐ3/L3A.\
**Runtime/live verification:** integration evidence; real Gemini
deferred to L3B-3.\
**Non-goals:** browser UX/full E2E.\
**Stop conditions:** custom Gemini loop, unsupported internal patching.\
**Exit gate:** supported native wiring proven and regression-clean.\
**Deliverable:** candidate checkpoint. **Next:** L3B-3.

### L3B-3 --- BOUNDARY VERIFICATION + RUNTIME PROBE

**Milestone:** M1. **Depends on:** L3B-2.\
**User outcome:** Gemini demonstrably understands a known canonical
uploaded file.\
**Scope:** targeted app-owned tests + locked regressions + real Gemini
probe.\
**Runtime/live verification:**
`known file → authorized mapping → native ADK load → Gemini content-dependent answer`.\
**Also verify:** same-owner unattached/foreign/stale blocked; bounds;
abort; no binary/base64/storage path; capability count 9;
persistent/temporary/HITL semantics.\
**Non-goals:** browser composer E2E.\
**Exit gate:** checker + real runtime evidence + canonical CI.\
**Deliverable:** L3B checkpoint eligible for lock. **Next:** L3C-0.

### L3C-0 --- ASSISTANT-UI REUSE GATE

**Milestone:** M1. **Depends on:** L3B lock.\
**User outcome:** safe composer implementation path is proven before UI
code.\
**Scope:** exact installed assistant-ui attachment/runtime API; existing
fileUploadClient.\
**Reuse targets:** installed AttachmentAdapter/composer lifecycle.\
**Pre-code gates:** A--E.\
**Stop conditions:** proposal creates second attachment state machine or
canonical base64 transport.\
**Exit gate:** approved adapter/lifecycle plan. **Next:** L3C-1.

### L3C-1 --- CANONICAL ATTACHMENTADAPTER INTEGRATION

**Depends on:** L3C-0.\
**User outcome:** browser File uploads through existing `/api/files` and
yields canonical `fileId` attachment state.\
**Scope:** thin adapter only.\
**Tests:** endpoint/fileId mapping; abort/stale; no storage
path/base64.\
**Non-goals:** broad visual redesign.\
**Exit gate:** adapter boundary verified. **Next:** L3C-2.

### L3C-2 --- VIETNAMESE COMPOSER UX + RECOVERY

**Depends on:** L3C-1.\
**User outcome:** pending/complete/remove/retry and understandable
Vietnamese errors.\
**Scope:** composer presentation/recovery; existing lifecycle.\
**Tests:** app-owned state/error mapping; temporary/persistent safe
refs.\
**Non-goals:** full app Agent redesign.\
**Exit gate:** usable composer behavior and regressions pass. **Next:**
L3C-3.

### L3C-3 --- COMPOSER VERIFICATION

**Depends on:** L3C-2.\
**Scope:** targeted integration, locked chat/file regressions,
responsive smoke where practical.\
**Exit gate:** checker + canonical CI; no browser base64 canonical
transport.\
**Next:** L3D.

### L3D --- REAL FIREBASE + GEMINI FULL E2E

**Milestone:** M1. **Depends on:** L3C lock.\
**User outcome:** real end-to-end document-assisted chat works.\
**Scope:** browser
select/upload/fileId/attach/send/auth/materialize/Gemini/SSE/reload-history.\
**Tests:** malformed/foreign/oversized; temporary chat; cancellation;
recovery; no leak.\
**Runtime/live verification:** mandatory real Firebase + Gemini.\
**Non-goals:** File Library, RAG, new parsing subsystem.\
**Exit gate:** complete workflow evidence + checker + canonical CI.\
**Deliverable:** M1 checkpoint. **Next:** W4A.

## 4. M2 --- Modular Foundation

### W4A --- MODULE SOURCE/ARCHITECTURE + REUSE AUDIT

Audit existing client/server composition, module state/catalog, Task
ownership and researched patterns. Complete A--E. No production code.
Exit: smallest hardening plan approved.

### W4B --- CLIENT/SERVER COMPOSITION BOUNDARY HARDENING

Move only necessary packaged-module knowledge to composition boundaries;
keep existing registries. No generic DI/plugin framework. Exit: Core
composition no longer owns Task business behavior and regressions pass.

### W4C --- TASK ISOLATION + FAILURE CONTAINMENT

Prove enable/disable/re-enable, UI contribution and capability
disappearance/return, durable data preservation and failure containment.
Exit: Core + Agent remain healthy with Task disabled.

### W4D --- MODULE-ISOLATION VERIFICATION

Run canonical module-isolation tests, locked regressions and CI. Exit:
W4 lock; no second registry/runtime.

## 5. M3 --- Product UX

### W5 --- CORE APP SHELL UX

**Depends on:** W4D. Outcome: Vietnamese, stable navigation, iPad-first
responsive shell, basic iPhone, collapsible Agent panel. Reuse existing
primitives. Non-goal: frontend rewrite. Exit: functional responsive
shell + regressions.

### W6 --- HOME UX

Outcome: daily-use Home with Task summary and Agent affordance; remove
architecture/demo teaching surfaces. Home remains module-agnostic. Exit:
useful empty/loading/error states and no new business authority.

### W7 --- AGENT UX

Outcome: Vietnamese Agent surface with history, temporary chat,
attachment presentation, HITL, loading/error/recovery and responsive
panel. Reuse assistant-ui. Exit: existing runtime semantics preserved.

### W8A --- TASK DOMAIN/SOURCE AUDIT + MVP CONTRACT

Complete A--E against current Task source. Define exact MVP behavior
without Jira/Trello expansion. Exit: approved smallest Task completion
plan.

### W8B --- TASK CORE COMPLETION

Outcome: view/create/edit/complete/archive-delete as canonical domain
permits; status/deadline/priority/persistence. Exit: domain/API/UI
behavior and reload verified.

### W8C --- TASK DAILY-USE UX

Outcome: search/filter/today/overdue/upcoming where data semantics
justify them. Optional dependencies require net-code/test proof. Exit:
daily-use Task UX on iPad/iPhone smoke.

### W8D --- AGENT PARITY + HITL

Outcome: Agent query/create/update through existing
capabilities/gateway/HITL; no duplicate Task service. Exit: UI and Agent
converge on same domain behavior.

### W8E --- TASK VERIFICATION

Targeted Task tests + module lifecycle + Agent parity + locked
regressions + CI. Exit: Task reference module lock.

### W9 --- SETTINGS + MODULE MANAGEMENT UX

Outcome: Vietnamese settings and visible Task enable/disable/re-enable
over canonical module state. No marketplace. Exit: lifecycle behavior
usable from Settings and regressions pass.

## 6. M4 --- Release

### W10 --- MVP INTEGRATED ACCEPTANCE

**Depends on:** W9. Verify login/open/reload; Home; Task UI; Agent Task
query/mutation; HITL; disable/re-enable; persistent/temporary chat;
document attachment; cancellation; recovery/error handling. Exit:
integrated workflow evidence; fix only reproducible blockers.

### W11 --- SECURITY + OPERATIONS HARDENING

**Depends on:** W10. Audit Firebase rules/server
auth/secrets/config/dependency
exploitability/logging/diagnostics/backup-recovery. App Check only if
threat model justifies. Exit: no unresolved MVP-blocking
security/operations issue and reproducible runbook/config.

### W12 --- UAT + DEPLOYMENT + RELEASE

**Depends on:** W11. Real iPad UAT, iPhone/desktop smoke, clean
build/deploy reproducibility, production deployment, final canonical
Actions, final docs reconciliation.\
**Exit gate:** only after real evidence may checker declare
`MVP FINAL PASS / LOCKED`.

## 7. Phase-count interpretation

The remaining MVP is **12 top-level workstreams (W1--W12)**. For
execution/checkpoint control, W1, W2, W4 and W8 are decomposed into
bounded candidate-sized lượt, yielding the canonical sequence above.
This is intentionally larger than per-file tasks and smaller than
multi-feature mega-candidates.
