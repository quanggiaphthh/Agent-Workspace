# AGENT-WORKSPACE — H2 AGENT WORKSPACE UX CLOSEOUT

**Status:** FINAL PASS / LOCKED  
**Scope:** bounded post-MVP Agent Workspace UI/UX improvement  
**Canonical implementation/verification checkpoint:** `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`  
**Canonical GitHub Actions:** run #179 — ID `36191114409` — **SUCCESS**  
**Date:** 2026-09-26

## 1. Scope locked

H2 improves only the client/UI projection of the existing Agent Workspace. It does not replace or redesign the Agent runtime, Google ADK, Gemini provider, SSE transport, session/history persistence, attachment contract, capability authority, HITL authority, Firebase persistence, or module-state authorities.

Product scope remains the single-owner personal application:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

No deferred module, marketplace, multi-user/team/org/billing scope, RAG/vector DB, or public plugin ecosystem was opened by H2. R3 was not opened.

## 2. Locked UX result

H2 establishes an explicit Agent workspace state model:

- **Closed/Rail** — fresh application load keeps the Agent workspace closed and exposes a compact Agent affordance;
- **Panel** — normal side workspace for Agent interaction;
- **Focus** — expanded Agent workspace using the same canonical shell/runtime rather than a second Agent implementation.

Responsive behavior is bounded to the existing application shell:

- wide layouts: workspace can operate side-by-side;
- medium layouts: Agent workspace projects as an overlay;
- narrow layouts: Agent workspace uses the available full-screen area.

The primary surface remains **Chat**. **Hội thoại** and **Bộ nhớ** remain secondary surfaces. User-facing labels remain Vietnamese.

## 3. Reuse and authority preservation

H2 follows the canonical reuse-first architecture:

- existing `eventBus` remains the Agent-open UI event path;
- existing `contextStore` remains the context source;
- existing `LocalModuleRegistry` remains the client module authority;
- module Agent suggestions are projected through the existing module registry/manifest seam instead of hard-coding Task prompts in Agent Core;
- existing composer upload path remains `uploadUserFile → /api/files → canonical fileId → sendMessage`;
- existing session/history and Temporary/Persistent Chat semantics are preserved;
- existing HITL projection remains authoritative;
- no second shell, runtime, registry, event bus, context authority, attachment authority, or confirmation authority was introduced;
- no new dependency was required.

`@assistant-ui/react` remains an installed dependency available for bounded primitive/pattern reuse; H2 does not migrate the canonical Agent runtime to assistant-ui.

## 4. UX behavior locked

The locked H2 behavior includes:

- fresh load does not force the Agent panel open;
- canonical `workspace:open-agent` behavior remains supported through the existing event bus;
- Agent rail affordance replaces the previous rotated-text treatment;
- Panel/Focus transitions do not create a second Agent runtime;
- context is presented as user-facing context chips without exposing raw internal IDs;
- Task contextual suggestions are contributed through the Task module manifest/registry seam;
- composer supports multiline input, auto-grow, send/cancel, upload/remove attachment and existing Temporary/Persistent Chat semantics;
- attachment sending continues to use canonical uploaded file references;
- persisted conversation UX is presented as **Hội thoại**;
- Memory remains a secondary surface and the demo/sample-seeding action is removed;
- tool activity is presented as collapsible **Hoạt động** without exposing model reasoning;
- existing HITL confirmation UI remains the confirmation projection;
- keyboard/focus/ARIA handling is improved within the bounded H2 surface.

## 5. Corrective history

Initial H2 integration exposed only stale/static QA assumptions, not a demonstrated production behavior regression.

Correctives were bounded to canonical verification assets and the production manifest:

1. production source manifest refreshed after the intentional H2 `AppShell.tsx` change;
2. Stage 4C attachment QA aligned with the canonical upload-backed composer path;
3. Stage 5 limiter QA aligned with typed `req.user` identity introduced by locked H1 typing;
4. W11 limiter QA aligned with the same canonical typed request identity.

These correctives did not change Agent/Task business behavior, authentication authority, provider/runtime behavior, dependencies, Firebase configuration, or deployment semantics.

## 6. Canonical verification

Canonical GitHub Actions run #179, ID `36191114409`, completed **SUCCESS** at checkpoint `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`.

Verified gates:

- TypeScript — **PASS**;
- targeted tests — **PASS**;
- full Vitest — **406/406 PASS**;
- QA Stage 1 — **22/22 PASS**;
- QA Stage 2 — **22/22 PASS**;
- QA Stage 3A — **8/8 PASS**;
- QA Stage 3B — **9/9 PASS**;
- QA Stage 3C — **8/8 PASS**;
- QA Stage 4A — **20/20 PASS**;
- QA Stage 4B — **43/43 PASS**;
- QA Stage 4C — **42/42 PASS**;
- QA Stage 4D — **40/40 PASS**;
- QA Stage 5 — **24/24 PASS**;
- W11 Security QA — **15/15 PASS**;
- production build — **PASS**;
- final production manifest verification — **PASS**.

The build continues to report a large JavaScript chunk warning (approximately 1.218 MB before gzip / 343.77 KB gzip). This is an optimization observation, not an H2 correctness blocker.

The existing dependency-security exception remains governed by its prior review policy and review deadline of **31/10/2026**. H2 does not broaden ZIP ingestion or enable an ADK skills loader.

## 7. Integrity

H2 does not intentionally change:

- Google ADK / RootAgent runtime;
- Gemini provider authority;
- SSE protocol;
- durable Agent session/history authority;
- attachment/file authority;
- capability execution authority;
- HITL/confirmation authority;
- Firebase Auth/Firestore/Storage trust boundary;
- Task business semantics;
- dependency set;
- deployment contract.

## 8. Closeout

**H2 — FINAL PASS / LOCKED.**

Canonical implementation/verification checkpoint: `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`.

Canonical CI: GitHub Actions run #179, ID `36191114409` — **SUCCESS**.

No R3 or successor production workstream is opened by this closeout. A new workstream requires a fresh source/reuse audit and an explicit gate decision.