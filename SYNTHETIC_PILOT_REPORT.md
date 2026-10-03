# Synthetic DOCX Pilot - Scoped Evidence Report

Date: 2026-10-03
Scope: webapp runtime worktree `C:\Dev\Agent-Webapp\worktrees\Agent-Workspace-document-formatting-runtime`
and canonical Processor `C:\Dev\Agent-Webapp\document-processor\v22-runtime`. Main checkout untouched.

## 0. Doubles disclosed (mocked vs real)

REAL: Express routing, `/api` auth middleware, OWNER_UID allowlist, permission resolver,
module gating, capability gateway (real challenge issue/consume), idempotency ledger logic,
real Processor over loopback, SafeDocxSnapshot/DocxParser/RuleCatalog/ValidationEngine/
FormattingPropertyMutationExecutor, authorization + source immutability, FileIngestionService
logic, filename sanitiser, size/type validation.

DOUBLED (test-only, NOT user runtime):
- `adminAuth.verifyIdToken` - repository's existing Firebase boundary seam.
- `userFileService.store/readBytes` - durable Firestore/Storage backend (Firestore NOT enabled).
- `adminFirestore.collection/runTransaction` - confirmation records + audit/confirmation transactions.
- `CapabilityExecutionIdempotencyService` repository - Map-backed execution ledger.
- `AuditService.log/update` - audit sink.

No credentials, no .env contents, no browser auth storage, no tokens printed.

## 1. Bug investigation

| Stage | Status | Detail |
|---|---|---|
| Root cause of user error | **UNCONFIRMED** | The generic string "Khong the hoan tac thao tac DOCX" is the UI `default` branch and matches several codes plus undefined, so it cannot uniquely identify a cause. No fresh authenticated request was captured (no browser auth access). A browser-cached error remains possible. |
| `PROCESSOR_NOT_CONFIGURED` mapping | PRESENT (not the cause) | Mapped in `DocumentFormattingModule.tsx` and allowlisted in `shared/contracts/capability.ts`; thrown as `DocumentProcessorError` and re-thrown intact by `preserveSafeFailure`. |
| Actionable presentation fix | **FIXED** | `DOCUMENT_PROCESSING_FAILED`, `EXECUTION_ERROR`, `PROCESSOR_INVALID_RESPONSE`, `RESULT_TOO_LARGE` now have specific Vietnamese messages instead of the catch-all. Regression tests added. |
| Stale scope copy | **FIXED** | Old text said "doi can le truc tiep cua mot doan" and title "co the chon can le"; now names the implemented families (chu, khoang cach doan, kho giay hoac le). Regression test added. |
| Request identifier correlation | **FIXED** | 
requestId is now generated BEFORE CapabilityExecutionService.execute and the same value flows into the gateway metadata (recorded by the audit sink), the request, and the 409/200/500 responses. Regression asserts the response id equals the id the gateway received. Frontend Binding.detectedDocumentTypeKey typed string | null to match the DTO. |
| Earlier request-id gap | **FIXED** | Previously the id was created after the gateway call, so the id shown could not be correlated. | `/api/capabilities/execute` now returns a safe `requestId` (existing `req.requestId` or a fresh UUID). Client `ExecuteResult.requestId`; UI appends "Ma yeu cau: <id>". No secrets or document content. |
| **Real defect found** | **FIXED** | Processor serialises `detectedDocumentTypeKey: null` for undetected documents, but the client schema allowed only `undefined`. Every undetected-type document failed validation and surfaced as `PROCESSOR_INVALID_RESPONSE`. Schema now `.nullable().optional()`. |

## 2. Runtime state at time of report

- webapp `127.0.0.1:3000`: **NOT LISTENING** at review time (earlier pid 17532 absent). Cause not inferred.
- Processor `127.0.0.1:5080` pid 7824: was alive.
- Consequence: a live signed-in UI pilot is **BLOCKED**, and restarting the console does **not**
  unblock it. This environment issued a **hard policy denial** on browser access. That denial is a
  policy decision, not a missing or stopped service, so no server restart, rebuild or configuration
  change can lift it. No restart was attempted, no token was read or reused, no bypass attempted.
  Until the policy itself changes, the signed-in UI pilot is **NOT RUN** and cannot be run from here.
  No alternative browser surface or workaround is proposed here, because that would be an attempt to
  route around the denial.

## 3. Fixtures (synthetic, fake data only)

Directory: `C:\Users\dtron\AppData\Local\Temp\opencode\synthetic-pilot\`

| Fixture | Input SHA-256 |
|---|---|
| synthetic-cong_van.docx | 011bad4748c80ce6d79e1ee790abaf94f840edf461d20e3f602901a2c20a1f79 |
| synthetic-quyet_dinh.docx | 5aa3ebc161caafb78472cd3c67563d5499f10b2d2a44c60b3f5800c13a8d5a78 |
| synthetic-bao_cao.docx | de90883dbf6c35b483f7ae6659ffa013b7b2071140a1b0a40880e359711322c0 |
| synthetic-ke_hoach.docx | c97406bece4459087eacc3e14f26b4cb46ebe6116b70ef18f75e9a3fc21e82bb |
| synthetic-to_trinh.docx | 18a4b836763fcce56d48325643d75c6bde8ae22c113a7f12c8e696477d0f9a3a |
| synthetic-undetermined.docx | 0e477db4b2ed4ee7f7785f43a47d42d2c9b979e4776f591ee22d436ba7cd9bbd |

Deliberate defects: 12pt body font, exact 240-twip line spacing, no body justification, 15mm right margin.
Official-letter contract derived from `AdministrativeSemanticDetector` (literal `V/v ` subject prefix
plus `Kính gửi:`; no competing document-type heading).

## 4. Upload route (real) - PASS

`POST /api/files` with raw body + `X-File-Name`, real auth + permission middleware + FileIngestionService.
Unauthenticated upload 401 with zero storage writes; authenticated upload 201 with owner-bound
descriptor; stored bytes SHA-identical to what was sent; the uploaded fileId then inspects through
`document.inspect`. Negative: non-`.docx` name rejected, empty body rejected.

## 5. Per-type pilot (real HTTP boundary) - 5/5 PASS

All: upload-equivalent store, inspect, detector-confirmed type, explicit owner re-confirm
(`ownerConfirmed=true`, same digest), margin `s1` 15->20mm via rule `ND30.PL1.I.GENERAL.MARGIN_RIGHT`,
409 challenge with zero Processor applies, single apply, distinct output fileId,
`reopened/revalidated/sourceUnchanged/outputInspectionPassed` true, source SHA unchanged,
download 200 + DOCX MIME + Content-Length equal to body length + body length equal to stored descriptor sizeBytes + SHA-256 equal to manifest outputSha256 and different from source (no byte-delta invariant asserted; ZIP size is not a DOCX semantic invariant), re-inspect shows 20 with top/left/page_size unchanged.

| Type | Output artifact | Output SHA-256 |
|---|---|---|
| cong_van | pilot-cong_van-margin20.docx | 6417b103dbbe492a2b1c99f4e04fed37f80ff815525cd1252601ea45f41191a2 |
| quyet_dinh | pilot-quyet_dinh-margin20.docx | 9469d34b77bdc2a278f36f3dc18358ad203129fde7ac0caef8317378aa976487 |
| bao_cao | pilot-bao_cao-margin20.docx | 99838b8e68539a5dbcb41e6ef1117d2ce76799b617d11b47a3714a6a14199aff |
| ke_hoach | pilot-ke_hoach-margin20.docx | de844eb20921f35be92a18e50f914dea1737581b254b020194a93f5114ff14fd |
| to_trinh | pilot-to_trinh-margin20.docx | b966e0c3cab8aa2d83d3b29717e7faf672df928100c35180a447335ca89fa0f1 |

## 6. Negatives - PASS

| Case | Result |
|---|---|
| Undetermined document | 200, `documentTypeKey=unknown`, `confirmed=false`, `detectedDocumentTypeKey=null`, 0 targets, subset 0. Forcing any of cong_van/quyet_dinh/bao_cao refused. Never relabelled. |
| Malformed DOCX (non-DOCX bytes) | precise domain rejection MALFORMED_DOCX, 0 applies, no new stored artifact. Assertion is exact; internal/contract codes are NOT accepted. |
| Unsupported confirmed type | rejected, 0 applies |
| Owner boundary | foreign uid cannot read owner's file, 0 applies |
| Idempotency replay | exact `CONFIRMATION_REPLAY`, no second artifact |

Internal/contract codes are NOT accepted as business rejections anywhere in these tests.

## 7. Word read-only evidence - 5/5 PASS

Earlier evidence was discarded and regenerated: the previous script hardcoded top=20 while the
fixture uses 1417 twips (24.99mm), so it could not support a preservation PASS. The new evidence
compares the ACTUAL input and output in Word: page dimensions, per-paragraph font/alignment/
line-spacing/indent/spacing signatures, and full text.

| Artifact | right margin | changed | text identical | para count | other dims | differing paragraphs | bytes unchanged |
|---|---|---|---|---|---|---|---|
| pilot-cong_van-margin20.docx | 14.99 -> 20.0 | yes | yes | 13 = 13 | equal | 0 | yes |
| pilot-quyet_dinh-margin20.docx | 14.99 -> 20.0 | yes | yes | 14 = 14 | equal | 0 | yes |
| pilot-bao_cao-margin20.docx | 14.99 -> 20.0 | yes | yes | 14 = 14 | equal | 0 | yes |
| pilot-ke_hoach-margin20.docx | 14.99 -> 20.0 | yes | yes | 14 = 14 | equal | 0 | yes |
| pilot-to_trinh-margin20.docx | 14.99 -> 20.0 | yes | yes | 14 = 14 | equal | 0 | yes |

Evidence file: `outputs\word-open-evidence.json`. Source inputs opened read-only and unchanged.

Fingerprint scope, stated precisely: each paragraph is fingerprinted from bold flag, font NAME
(run-level, with a MIXED sentinel when runs differ), font size, alignment, line-spacing rule and
value, space before/after, left/first-line/right indents, and full paragraph text, at full decimal
precision with no integer truncation. This is measured on homogeneous single-section synthetic
fixtures where every run uses a single font. It is NOT an exhaustive run-level preservation proof:
Words iteration is a sampled traversal, and a MIXED sentinel only reports that runs differ, not
which properties differ. Page dimensions and full document text are compared exactly.

The script hard-asserts its own gate: WORD_EXIT is 0 only when all five cases are present and each
has RightChanged, TextIdentical, ParaCountEqual, OtherDimsEqual, DiffCount=0 and UnchangedByWord
checked for BOTH the source input and the output. GATE_FAILURES=0 / WORD_GATE_PASSED.

## 8. Command receipts

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (`DocumentEngine.slnx` -> isolated procbuild OutDir, fresh) | 0 |
| PROC_BUILD_EXIT (`tests/LegalValidator.Tests` project, fresh, run before tests) | 0 - 0 errors |
| PROC_TEST_EXIT (profile/apply/mutation/service, targeted) | 0 - **77 passed** |
| WEBAPP_TSC_EXIT (previous round) | 0 |
| WEBAPP_RELEVANT_EXIT (UI + capability contract, previous round) | 0 - 51 passed / 4 files |
| WEBAPP_TARGETED_EXIT (full related set, previous round) | 0 - 177 passed / 16 files |
| WORD_EXIT (read-only Word evidence, hard gate, previous round) | 0 - GATE_FAILURES=0 |

Exact commands for the current Processor round, run from
`C:\Dev\Agent-Webapp\document-processor\v22-runtime`. The isolated solution build is required
because the long-running host (pid 7824, untouched) holds the default bin directory open; tests use
`--no-build` only after the fresh test-project build, never against a stale binary.

```
dotnet build DocumentEngine.slnx -c Release --nologo -v q -p:OutDir=C:\Users\dtron\AppData\Local\Temp\opencode\procbuild\
dotnet build tests/LegalValidator.Tests/LegalValidator.Tests.csproj -c Release --nologo -v q
dotnet test  tests/LegalValidator.Tests/LegalValidator.Tests.csproj -c Release --no-build --nologo --filter "FullyQualifiedName~FormattingApplyServiceTests|FullyQualifiedName~FormattingPropertyMutationTests|FullyQualifiedName~FormattingProfileV1Tests|FullyQualifiedName~DocumentProcessorServiceTests"
```

Persistent stdout receipts under `C:\Users\dtron\AppData\Local\Temp\opencode\`, all preserved:

| Receipt | Bytes | Contents |
|---|---|---|
| `proc-build.log` | 2918 | fresh test-project build, `0 Error(s)` |
| `proc-targeted.log` | 696 | `Passed! - Failed: 0, Passed: 77` |
| `proc-build-receipts.json` | 6002 | Codex-exported build-step receipts, including the earlier failed build and the successful corrected build |
| `procbuild\` | — | isolated solution build output |
| `synthetic-pilot\outputs\pilot-receipts.json` | — | per-type pilot receipts (previous evidence) |
| `synthetic-pilot\outputs\word-open-evidence.json` | — | Word read-only evidence (previous evidence) |

The earlier failed build is deliberately retained in `proc-build-receipts.json` rather than
overwritten; `CS0103 LineSpacingRuleValues` was a name collision with the project model's
`LineSpacingRule`, fixed by fully qualifying the OpenXML enum.

Generated `bin/` directories and `test.log` / `tsc.log` in the Processor repo were left in place, not
cleaned.

Source fingerprints (SHA-256, first 16 hex) at the time of this round:

| File | Fingerprint | Note |
|---|---|---|
| `tests/LegalValidator.Tests/FormattingProfileV1Tests.cs` | `d59c29f4dea448a6` | changed this round |
| `src/LegalValidator/Adapters/FormattingObservationAdapter.cs` | `7d41dcebe4c2cda0` | alias fix from 8d, unchanged since |
| `fixtures/v23/02-named-decision.docx` | `7be66e5ac9554027` | source fixture, unmodified on disk |

Test-count movement: 76 -> 77 with the added alias regression; the eligibility test lost its two
duplicated target assertions, which are covered by
`Canonical_line_spacing_target_is_written_end_to_end` and the fixture tests. No assertion was
weakened and no test was removed.

Webapp suites were **not** rerun this round: no webapp contract changed. This gate is a Processor
observation/evaluation unit regression plus test edits; `patchEligibility`, findings and the JSON
contract, routes and registration are untouched. The 51/4, 177/16 and WORD receipts above are
labelled previous-round rather than restated as current.

## 8b. Advertised-apply honesty round (this round)

Two places advertised work the server could not actually do. Both are fixed, and both are
regression-locked.

### `document.effective_font_family` withdrawn from advertised applies

The profile published this mutation target at `document` scope while `EnumerateMutableTargets`
emitted it with an **empty** `targetId`. The webapp requires `targetId` min length 1, so every
apply for it was rejected before execution, and `DocumentProcessorService` routed the non-paragraph
property to the Section resolver, which has no font-family branch.

Font-family mutation was **not** implemented, because preservation cannot be proven from the
current evidence:

- the observation resolves the **inherited** family of **top-level body paragraphs only** — it
  excludes table cells, headers and footers, and cannot distinguish a direct font from an
  inherited one;
- there is no document-scope mutation kind, so any implementation would need to invent one;
- writing `w:rFonts` document-wide would change appearance in parts of the package that were
  never observed, which is exactly the collateral-change class this project refuses.

So it fails closed. The `ND30.PL1.I.GENERAL.FONT_FAMILY` rule is **still evaluated and still
reported** for all five types — validation coverage was not shrunk to make things look compliant.
Only the apply offer is withdrawn, and eligibility is no longer overstated: a finding whose
property has no mutation target is now reported `SUGGEST_ONLY` instead of `ELIGIBLE`.

Result: advertised properties drop 12 -> 11; remaining scopes are `paragraph` and `section` only;
every advertised target carries a non-empty id.

### Host `/capabilities` metadata realigned

`operations` advertised `["inspect", "paragraph.alignment.direct"]`. `paragraph.alignment.direct`
is a pre-profile spike name: not an operation, not a property, not a rule id. Apply is the single
`/apply` route bound to a profile property, target, profile digest and rule id. It is now
`["inspect", "apply"]`. Stored execution records keep replaying under their original logical id, so
this metadata correction breaks no persisted state.

Live metadata receipt from the freshly built host (`GET /capabilities`, bearer-authenticated):

```
OPERATIONS=inspect,apply
SUPPORTED_COUNT=11
HAS_FONT_FAMILY=False
```

Regression guards: `Font_family_is_reported_but_not_offered_as_an_apply` and
`Host_capabilities_metadata_cannot_advertise_a_property_that_is_not_an_operation`. The host guard
pins the advertised operation set to exactly `{inspect, apply}` (order-insensitive equality), so
adding an arbitrary verb is now a test failure rather than a silent metadata drift.

### Eligibility downgrade defect found and fixed while hardening that guard

Hardening the font-family assertion exposed a real defect in the downgrade introduced earlier in
this round. Eligibility was being decided by comparing property names, but a rule targets a **bare**
property while a mutation target is **scope-qualified**:

| Rule | Rule property | Declared mutation target |
|---|---|---|
| `ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN` | `paragraph_spacing_pt` | `paragraph.spacing_after_pt` |
| `ND30.PL1.I.II.6E.BODY_LINE_SPACING_RANGE` | `line_spacing` | `paragraph.line_spacing_lines` |
| `ND30.PL1.I.GENERAL.FONT_FAMILY` | `effective_font_family` | *(none — withdrawn)* |

The name comparison never matched, so **every** finding was downgraded to `SUGGEST_ONLY`, which
would have silently stopped the UI offering any apply at all.

Fixed by binding on the authoritative declared tuple: `AppliesToAMutationTarget` now matches
`ProfileMutationTarget.RuleId` against `ValidationResult.RuleId`. Property-name spelling is no
longer consulted. Fail-closed behaviour is preserved for unbound rules: the font-family rule has no
declared target, so it stays `SUGGEST_ONLY`.

Regression `Eligibility_is_bound_by_rule_id_so_target_backed_findings_are_not_downgraded`:

- asserts the declared tuples for both spacing rules, and that the font-family rule is absent;
- forces genuine failures on a semantic body paragraph — a 0 twip after-gap against the declared
  6–999 pt minimum, and 2.0 line spacing against the declared 1.0–1.5 line range;
- asserts both findings are reported under the **bare** rule properties `paragraph_spacing_pt` and
  `line_spacing`, and that neither is `SUGGEST_ONLY`;
- asserts the blanket invariant over every reported finding: nothing bound to a declared target may
  be `SUGGEST_ONLY`;
- asserts the applies really are offered, i.e. `paragraph.spacing_after_pt` and
  `paragraph.line_spacing_lines` appear as targets bound to that same paragraph — no unbacked apply
  claim;
- asserts the line-spacing finding carries the injected out-of-range multiple as its observed value,
  proving the observation is genuinely produced rather than synthesised. The observed value is parsed
  with the invariant culture and compared numerically for exact equality with `2.0`, so a substring
  `"2"` inside `"2.04"` or `"12"` cannot satisfy it;
- font family remains `SUGGEST_ONLY` with no target offered (separate test, see above).

Note on test construction: every checked-in `fixtures/v23` document already declares Times New
Roman in `styles.xml`, which is what the ND30 font rule requires, so the rule **passes** and emits
no finding. The font test therefore rewrites the default font to a non-compliant family **in memory**
(new `WithNonCompliantDefaultFont` helper, verified by an independent read-only reopen) before
asserting. Without that, `Assert.NotEmpty` would have passed vacuously against an empty collection.

## 8d. Root cause: ND30 body line-spacing rule never evaluated

**Symptom.** `ND30.PL1.I.II.6E.BODY_LINE_SPACING_RANGE` emitted no finding for any injected
out-of-range body line spacing, so the eligibility regression could not be written honestly.

**Root cause.** A dead observation key, not a fixture problem.

- The verified rule targets `semantic_component` / `line_spacing`, and its declared constraint is
  `{"type":"numeric_range","min":1.0,"max":1.5,"unit":"line"}`.
- `line_spacing` **is** in `FormattingProfileV1.ObservableProperties`, so the rule was correctly
  included in the evaluated subset.
- But nothing ever published the key it targets. `FormattingObservationAdapter` deliberately drops
  the component adapter's `.line_spacing` observation (it folds a line multiple and an absolute
  point value into one ambiguous field) and re-publishes only `line_spacing_lines` /
  `line_spacing_pt`. `ObserveBodyParagraph` rolled up only those two.

So the rule had no producer: it evaluated as `NOT_EVALUATED` with a declared missing observation for
**every** document, and `NOT_EVALUATED` results are not reported as findings. The ND30 line-spacing
rule was silently dead in this build. This is a genuine validation-coverage hole, and it was found
only because a test tried to assert on it.

**Minimal change** — one statement in
`src/LegalValidator/Adapters/FormattingObservationAdapter.cs`, `ObserveBodyParagraph`:

```csharp
RollUpBody(context, bodyParagraphIds, "line_spacing_lines", "semantic_component.body.line_spacing");
```

It republishes the already-disambiguated line multiple under the key the rule actually targets. The
value is present only for `lineRule="auto"`, so the published quantity stays unambiguous.

**Precision on the two different "no value" outcomes.** These are distinct and must not be conflated:

- **Nothing stated** — a body where *no* paragraph gives a line multiple (wholly `exact`, or wholly
  `atLeast`). `RollUpBody` sees zero observations and returns without publishing or flagging
  anything, so the alias is simply absent and the rule reports a missing observation as
  **NOT_EVALUATED**. That is the honest verdict: the document states nothing about line multiples.
- **Partially stated** — a body where *some* paragraphs give a multiple and others do not (mixed
  `auto`/`exact`, or one paragraph missing its observation). `RollUpBody` marks the role uncertain,
  the alias stays absent, and the evaluator reports **NEEDS_REVIEW**.

Neither outcome invents a value, and neither produces a false FAIL. The distinction is now pinned by
`Body_line_spacing_alias_is_unit_safe_across_auto_exact_atleast_and_mixed`.

**Unit-safety regression** (in-memory only; the fixture on disk is never rewritten, and the test
re-asserts its SHA-256 is unchanged at the end):

| Case | Alias | Rule status | Observed |
|---|---|---|---|
| uniform `auto` 240 twips | present | PASS | exactly 1.0 |
| uniform `auto` 360 twips | present | PASS | exactly 1.5 |
| uniform `auto` 480 twips | present | FAIL | exactly 2.0 |
| wholly `exact` | absent | NOT_EVALUATED | — |
| wholly `atLeast` | absent | NOT_EVALUATED | — |
| mixed `auto`/`exact` | absent | NEEDS_REVIEW | — |
| one body paragraph missing | absent | NEEDS_REVIEW | — |

Observed values are compared **numerically** via `double.Parse` with an exact tolerance, never by
substring, so an observed `2.04` could not satisfy the "exactly 2" requirement. The pre-existing
mixed-unit test was left untouched and still passes.

No rule, catalog or profile change was made, and the release pack was not touched.

**Evidence after the fix** (`PROC_TEST_EXIT=0`, 76/76): both findings now exist and are
target-backed, while font family stays `SUGGEST_ONLY`. The pre-existing end-to-end
`Canonical_line_spacing_target_is_written_end_to_end` still passes, so the change did not disturb
the apply path.

**Rejected alternatives.** Changing the rule or its target property would mean editing the verified
release pack, which is out of bounds. Loosening the test to accept a missing finding would have
preserved the dead rule and hidden it.

### Applied bytes are unchanged by this round

All five pilot output SHA-256 values are byte-identical to the previous round. The profile digest
moved; the emitted DOCX did not. Receipts in section 5 stand.

### Running-host lock accommodation

A long-running Processor (pid 7824) holds `src/DocumentProcessor.Host/bin/Release` open, so a
solution build cannot write there (`MSB3021`/`MSB3027`). That process was **not** killed or
restarted. Instead the current source was built to a separate output directory and the pilot was
pointed at it via `PROCESSOR_HOST_DLL`, with `DOCUMENT_PROCESSOR_LEGAL_ROOT` supplying the verified
release pack that the host otherwise resolves by walking up from its own bin directory.

Consequence worth stating plainly: **the host still running on `127.0.0.1:5080` is the previous
build** and still advertises the old metadata. It will keep behaving as before until the user
restarts it. No live pilot evidence in this report comes from that stale process.

### Stale test fixture repaired

`server/core/documents/__tests__/documentProcessorIam.test.ts` carried a canned inspection payload
that predated the current schema, so two IAM tests failed validation for reasons unrelated to IAM.
Test data only was updated to a schema-valid payload; the IAM/id-token assertions are untouched.

## 8c. Git / diff hygiene

Correction to an earlier statement in this session: the claim that "neither the main root nor the
webapp worktree is a Git repo" was **false**. It came from running `git -C C:\Dev\Agent-Webapp`,
which is a container directory, not a repository. The actual repository roots are below, verified
with `git -C` on exact paths.

| Repository root | HEAD | `git status --porcelain` |
|---|---|---|
| `C:\Dev\Agent-Webapp\Agent-Workspace` (main checkout) | `dcb33ac` | **0 entries — clean**, `## main...origin/main` |
| `C:\Dev\Agent-Webapp\worktrees\Agent-Workspace-document-formatting-runtime` (implementation worktree) | `dcb33ac` | **26 entries — intended dirty changes** |
| `C:\Dev\Agent-Webapp\document-processor` (Processor Git root) | — | **24 entries**, split below |

The worktree is a valid linked worktree (`git rev-parse --is-inside-work-tree` → `true`) at the same
commit as the main checkout, so **the main checkout was never modified**. All implementation work
is confined to the worktree.

### Worktree: 26 changed entries

- 15 modified: `server.ts`, `server/agent/adk/CapabilityToolAdapter.ts`,
  `server/core/capabilities/CapabilityExecutionService.ts`,
  `server/core/capabilities/serverCapabilityRegistry.ts`,
  `server/core/documents/documentProcessorClient.ts`,
  `server/modules/document-formatting/registration.ts`, `shared/contracts/capability.ts`,
  `shared/contracts/module.ts`, `src/agent/ui/AgentChatThread.tsx`,
  `src/app/shell/ModuleSidebar.tsx`, `src/core/capabilities/capabilityRegistry.ts`,
  `src/core/modules/moduleRegistry.ts`, `src/modules/document-formatting/manifest.ts`,
  `src/modules/home/FileUploadCard.tsx`, `src/router.tsx`
- 4 modified tests: `capabilityContract.test.ts`, `executionIdempotency.test.ts`,
  `documentProcessorIam.test.ts`, `DocumentFormattingModule.test.tsx`
- 3 added: `DocumentFormattingModule.tsx`, `clientCapabilityExecution.test.ts`,
  `moduleSyncGating.test.ts`
- 2 renamed: `fileUploadClient.ts` and `fileUploadClient.test.ts` moved from
  `src/modules/home/` to `src/core/files/` (canonical file authority boundary)
- 2 untracked: `SYNTHETIC_PILOT_REPORT.md`, `server/modules/document-formatting/__tests__/`

No cloud or security configuration is in the change set: `firebase.json`,
`firestore.indexes.json`, `firestore.rules`, `.firebaserc` and CI workflows are untouched. No
durable Firestore module enablement was added. No secret, token or `.env` value was read or printed;
the only credential-shaped value used was a synthetic local bearer string for a throwaway test host.

### Processor: 24 entries, source vs generated

Git root is `C:\Dev\Agent-Webapp\document-processor`; paths are reported relative to it under
`v22-runtime/`.

- **15 source entries** — 4 modified: `src/DocumentEngine/Parsing/DocxParser.cs`,
  `src/DocumentProcessor.Host/Program.cs`, `src/LegalValidator/Catalog/RuleCatalog.cs`,
  `src/LegalValidator/Processing/DocumentProcessorService.cs`; 11 untracked source/fixture files:
  `src/LegalValidator/Adapters/FormattingObservationAdapter.cs`,
  `src/LegalValidator/Mutation/FormattingPropertyMutationExecutor.cs`,
  `src/LegalValidator/Profiles/`, three `tests/LegalValidator.Tests/Formatting*Tests.cs`, and five
  `fixtures/v23/1[2-6]-*.docx` synthetic party fixtures.
- **9 generated artifacts** — 7 `bin/` output directories (`src/DocumentEngine`,
  `src/DocumentProcessor.Host`, `src/LegalValidator`, `src/SemanticDetector`,
  `tests/DocumentEngine.Tests`, `tests/LegalValidator.Tests`, `tests/SemanticDetector.Tests`),
  plus `test.log` and `tsc.log`.

These 9 are untracked build/log output only. **Nothing was deleted or cleaned** — no `git clean`,
no removal of any `bin/`, log, or fixture file. They are reported for transparency, not as changes.
Source fixtures under `fixtures/v23/` are read-only inputs to this work and were not overwritten;
the pilot writes only to `C:\Users\dtron\AppData\Local\Temp\opencode\`.

### `git diff --check`

| Repository | `git diff --check` | `git diff --check HEAD` |
|---|---|---|
| `C:\Dev\Agent-Webapp\Agent-Workspace` | exit **0** | exit **0** |
| `...\worktrees\Agent-Workspace-document-formatting-runtime` | exit **0** | exit **0** |
| `C:\Dev\Agent-Webapp\document-processor` | exit **0** | exit **0** |

No whitespace errors in any repository. The only output is Windows `core.autocrlf` normalization
notices (`LF will be replaced by CRLF the next time Git touches it`) for the six worktree files and
two Processor files that were written with LF endings. That is informational line-ending
normalization, not a whitespace defect, and no file was rewritten to silence it.

## 8e. Producer-vs-target audit of the 5-type formatter scope

An audit compared every rule in the 5-type profile subset (51 rules) against the keys the adapter
actually produced across the five synthetic pilot fixtures and `fixtures/v23/02-named-decision.docx`.
Diagnostic output: `C:\Users\dtron\AppData\Local\Temp\opencode\producer-audit.txt` (51 rules, 179
produced keys, 24 without a producer). The audit scaffolding was removed after use; only the two
permanent regressions below remain.

### Confirmed defect 1 — six section rules had no producer (FIXED)

`PAGE_SIZE_A4`, `ORIENTATION_PORTRAIT_DEFAULT`, `MARGIN_TOP`, `MARGIN_RIGHT`, `MARGIN_BOTTOM`,
`MARGIN_LEFT` target the bare keys `section.page_size`, `section.orientation` and
`section.margin_*_mm`. `ObserveSections` published only `section.<name>.<sectionId>` and
`section.<name>.all`, so the bare form had no producer and all six rules evaluated as
`NOT_EVALUATED` for every document — including `MARGIN_RIGHT`, the rule the synthetic pilot applies.

Fix: publish the bare key whenever every section that states the property agrees, which is exactly
the condition under which the `.all` value is a single number instead of `"mixed"`. Sections that
disagree leave the bare key absent and the rule honestly unevaluated. Nothing is invented.

Regression `Section_rules_observe_the_bare_keys_the_release_pack_targets` asserts the bare key
exists whenever a section-scoped observation for the same property exists, that each rule is not
`NOT_EVALUATED`, and that at least four rules actually evaluate so the loop cannot pass vacuously.

An earlier attempt in this round gated the bare key on a single-section document and failed against
`02-named-decision.docx`, which has more than one section. That was my over-restriction, not a
fixture problem, and it was corrected rather than asserted around.

### Confirmed defect 2 — `document_type_abbreviation` (KEPT PENDING, deliberately)

Four abbreviation rules (`QUYET_DINH`, `BAO_CAO`, `KE_HOACH`, `TO_TRINH`) target
`document_metadata.document_type_abbreviation`. ND30 special-cases the abbreviation form — a
two-word type is not simply its initials — so a mechanical derivation would produce wrong verdicts.
It stays in `PendingObservationProperties` and out of `ObservableProperties`, and the subset is not
shrunk. `Document_type_abbreviation_stays_pending_and_is_never_invented` pins that: the key is
absent from the context and the rule reports `NOT_EVALUATED`.

### Confirmed dead keys reported, NOT fixed (out of bounded scope)

| Class | Rules | Precise cause |
|---|---|---|
| role-level `italic` — **NOT a dead producer** | 10 (`NATIONAL_HEADER_UPRIGHT`, `PARENT_UPRIGHT_NOT_BOLD_REQUIRED`, `PLACE_DATE_ITALIC`, `OFFICIAL_LETTER_SUBJECT_UPRIGHT`, `LEGAL_BASIS_ITALIC`, `BODY_UPRIGHT`, `ADDRESSEE_UPRIGHT`, `RECIPIENT_LIST_UPRIGHT`, and 2 more) | **Correction:** `SemanticValidationContextBuilder.cs:44` does emit `italic`. The earlier claim that these rules had no producer was wrong. The keys were simply absent on the sampled fixtures, which is missing/null evidence — the rule then reports honestly rather than being declared dead. No default `false` is invented for an unresolved italic. |
| non-body `line_spacing` | 2 (`HEADER_MOTTO_SINGLE_LINE_SPACING`, `ISSUER_PARENT_SINGLE_LINE_SPACING`) | the 8d alias fix was applied to the body role only; `national_header_motto_block` and `issuer_block` have no producer. |
| role naming mismatch | 2 (`MOTTO_BOLD` targets `national_motto`, `RECIPIENT_LABEL_SIZE` targets `recipient_list_label`) | the property is produced under a different role name. Correcting it means either editing the verified release pack (out of bounds) or renaming a semantic role (needs its own evidence). |

None of these were hidden by shrinking the subset or capabilities. Fixing the `italic` class requires
the semantic component builder to emit a truthful per-role italic value, which is a feature with its
own preservation argument, not a minimal fix.

### Also in this round

- The contradictory comment in the eligibility test (which claimed its target assertions were "not
  repeated here" while they remained) was corrected. Those two assertions are retained because they
  are meaningful: they prove a target-backed finding has a real offered target behind it.
- An unused `AliasKey` constant in the evaluation helper was removed.
- `CS8604` at `FormattingPropertyMutationTests.cs:63` fixed at source: `SizedRun` no longer passes a
  null element into the `RunProperties` params array and instead appends `FontSizeComplexScript` only
  when present. No suppression, no `!`.
- `CS8600` at `FormattingPropertyMutationExecutor.cs:516` (`temporary = null` on a non-nullable
  local) is **still open**. It is production source outside this gate's scope; correcting it means
  making the executor's temp-path handling nullable, which deserves its own verification. It is
  reported rather than silenced.

## 8f. Command receipts — producer audit round

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (`DocumentEngine.slnx` -> isolated procbuild OutDir) | 0 |
| PROC_BUILD_EXIT (`tests/LegalValidator.Tests`, fresh, before tests) | 0 |
| PROC_TEST_EXIT (profile/apply/mutation/service, targeted) | 0 - **79 passed** (was 77) |
| WEBAPP_TSC_EXIT | 0 |
| WEBAPP_TARGETED_EXIT (server + UI document-formatting) | **1 - 49 passed / 50, 1 FAILED** |

```
dotnet build DocumentEngine.slnx -c Release --nologo -v q -p:OutDir=C:\Users\dtron\AppData\Local\Temp\opencode\procbuild\
dotnet build tests/LegalValidator.Tests/LegalValidator.Tests.csproj -c Release --nologo -v q
dotnet test  tests/LegalValidator.Tests/LegalValidator.Tests.csproj -c Release --no-build --nologo --filter "FullyQualifiedName~FormattingApplyServiceTests|FullyQualifiedName~FormattingPropertyMutationTests|FullyQualifiedName~FormattingProfileV1Tests|FullyQualifiedName~DocumentProcessorServiceTests"
npx.cmd tsc --noEmit -p tsconfig.json
npx.cmd vitest run server/modules/document-formatting src/modules/document-formatting
```

Persistent receipts, unique per round, none deleted or overwritten: `r2-build.log`, `r2-targeted.log`,
`r2-solbuild.log`, `r3-build.log`, `r3-targeted.log`, `r4-solbuild.log`, `r4-build.log`,
`r4-targeted.log`, `r4-webapp-tsc.log`, `r4-webapp-targeted.log`, `producer-audit.txt`, plus the
earlier `proc-build.log`, `proc-targeted.log` and `proc-build-receipts.json`, all under
`C:\Users\dtron\AppData\Local\Temp\opencode\`.

### Webapp suite is NOT green — recorded, not glossed

`server/modules/document-formatting/__tests__/formattingConfirmationE2E.test.ts` fails at the apply
step (`expect(applied.success).toBe(true)`, line 257). The cause was **not isolated** within this
gate. One relevant fact: that test spawns the Processor host from the hardcoded default path
`src/DocumentProcessor.Host/bin/Release/net10.0/DocumentProcessor.Host.dll` and ignores
`PROCESSOR_HOST_DLL`, so it exercised the stale locked binary rather than the fresh isolated build.
Because the section fix changes which findings the inspection returns, that suite must be re-run
against the current host before any claim of a green webapp is made. No green claim is made here.

Source fingerprints (SHA-256, first 16 hex) for this round are recorded in §8e/§8f; the adapter is
`src/LegalValidator/Adapters/FormattingObservationAdapter.cs`, the audit subject.

## 8g. Confirmed adapter defects fixed (round r5)

Root-caused from source, then fixed. No catalog or enum edit, no subset or capability reduction.

### 1. `ObserveTwips` never published a per-section margin — FIXED

`ObserveTwips` called `Twips(twips, null, null, null, null)`. That helper selects on the `which`
name and only recognises the four margin names, so with `which == null` the switch fell to
`_ => null` and returned null **on every call**. No `section.<name>.<sectionId>` margin was ever
published. Now converts twips to millimetres directly.

### 2. Section consensus could claim a value from a single known section — FIXED

The old code filtered out null sections and then required one distinct remaining value, so a
document where only one of several sections stated a margin would publish that lone value as fact.
`ObserveSectionConsensus` now requires every section to state the property and all to agree:

- no section states it -> no observation, rule reports `NOT_EVALUATED`;
- some state it, some do not -> uncertain, rule reports `NEEDS_REVIEW`;
- all state the same value -> observed;
- sections disagree -> uncertain.

Applies to both the `.all` and the bare form.

### 3. Body alignment vocabulary mismatch — FIXED

`CanonicalAlignment` produces upper case (`JUSTIFY`), but `ND30.PL1.I.II.6E.BODY_JUSTIFIED` expects
`"justify"` and the evaluator compares with ordinal equality, so a fully justified body falsely
FAILED. The role observation is now lower-cased at the adapter role boundary only; the mutable
target contract keeps its upper-case values unchanged.

### 4. Explicit black not mapped onto the rule vocabulary — FIXED

`ND30.PL1.I.GENERAL.FONT_COLOR` expects the word `black`, while the DOCX carries an explicit sRGB
hex such as `000000`. `NormalizeFontColor` maps an explicitly written black hex to `black` and
passes every other value through untouched. An automatic or theme-derived colour is **never**
dressed up as a resolved black.

### 5. The earlier webapp E2E failure is resolved, and the cause is now established

`formattingConfirmationE2E.test.ts` spawned the Processor from the hardcoded default bin path and
ignored `PROCESSOR_HOST_DLL`, so it ran against the stale locked binary. It now honours
`PROCESSOR_HOST_DLL` and `DOCUMENT_PROCESSOR_LEGAL_ROOT`, the same seams the synthetic pilot uses.
Re-run against the fresh isolated build it passes. This is now a **verified** cause, not an
assumption: the previous round's failure was against the stale binary, and the same test is green
against the current one.

## 8h. Receipts — round r5

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (`DocumentEngine.slnx` -> isolated procbuild OutDir) | 0 |
| PROC_BUILD_EXIT (`tests/LegalValidator.Tests`, fresh, before tests) | 0 |
| PROC_TEST_EXIT (profile/apply/mutation/service, targeted) | 0 - 79 passed |
| WEBAPP_TSC_EXIT | 0 |
| WEBAPP_TARGETED_EXIT (server + UI document-formatting) | **0 - 50 passed / 7 files** |

The webapp suite is green again against the current host. The earlier 49/50 result is superseded,
not deleted: `r4-webapp-targeted.log` is retained.

Persistent receipts under `C:\Users\dtron\AppData\Local\Temp\opencode\`, unique per round, none
deleted: `r2-*`, `r3-*`, `r4-*`, `r5-*` (solbuild/build/targeted/webapp-tsc/webapp-targeted),
`producer-audit.txt`, plus `proc-build.log`, `proc-targeted.log`, `proc-build-receipts.json`.

### Still open in this gate — not claimed done

| Item | Status |
|---|---|
| Composite `national_header_motto_block` / `issuer_block` line keys | **not implemented.** The 8d body alias does not cover these two roles. Needs the header+motto and issuer+parent paragraph sets aggregated with the existing rollup. |
| `recipient_list_label` vs `recipient_list` | **not implemented.** Needs the label paragraph observed under its own role so it stops being judged as list formatting. The following list paragraphs must not be invented; while the detector does not collect them the actual list stays honestly unobserved. |
| Non-body role consensus (component builder reads the first run and overwrites) | **not implemented.** Needs adapter-scoped consensus per role; mixed/missing/ambiguous must become `NEEDS_REVIEW` rather than false certainty. |
| `CS8600` at `FormattingPropertyMutationExecutor.cs:516` | **not fixed.** `temporary = null` on a non-nullable local. Correcting it means making the executor's temp-path handling nullable, which needs its own focused verification. Not suppressed. |
| Full release-pack producer audit | **not done.** This round covered the 5-type formatter scope only, as scoped. |

## 8i. r6/r7 — reviewer-found defects in the r5 patch, fixed

All three r5 regressions were root-caused from source, proven with a failing regression **before**
the production change, then fixed minimally.

### 1. Blank margin value would have been parsed as a number — FIXED

`Format(Twips(null))` yields an empty string, but `ObserveSectionConsensus` only recognised `null`.
An all-missing document therefore reached `ParseMillimetres("")` and threw. The projection now
treats null **and** whitespace-only as "not stated", so a missing margin is never parsed.

### 2. Orientation / page size published a literal `mixed`, and `.all` was dropped — FIXED

The bare keys were first observed as the literal `"mixed"`, which an ordinal-equality rule reads as
a real non-conforming value (a false FAIL), and the `.all` keys were lost entirely. Both the bare
and `.all` forms now go through the same consensus, `"unknown"` counts as missing, and no sentinel
string is ever published. `.all` is preserved for compatibility.

### 3. Font colour projection was not complete across runs — FIXED

`NormalizeFontColor` passed `auto` through unchanged, so an unresolved colour produced a real FAIL,
and the collector silently skipped unknown runs, so known-black plus one unknown falsely PASSed.
`ResolveExplicitColor` now returns null for automatic and theme-derived colours, and the collector
records **every** run so completeness is visible. Projection:

| Runs | Outcome |
|---|---|
| all explicitly black | observe `black` -> PASS |
| all known, at least one non-black | observe that real non-black value -> FAIL |
| all unknown (auto / theme) | nothing published -> NOT_EVALUATED |
| some known, some unknown | uncertain -> NEEDS_REVIEW |

An automatic or theme-derived colour is never resolved to black.

### 4. `CS8600` in the mutation executor — FIXED, no suppression

`temporary` was already nullable at the call site; the warning came from `temporary = null` on
`Publish`'s **non-nullable** parameter, a dead assignment after `File.Move` on a path where the
value is never read again. Removed, with a comment recording why. `CS8600` is absent from the fresh
isolated solution build.

### New regressions (both failed against r5 code first)

`Section_margin_consensus_distinguishes_missing_partial_mixed_and_complete` builds multi-section
documents in memory and pins: complete-and-stated gives real per-section, `.all` and bare numbers
with the rule judging the number; all-missing gives no observation and `NOT_EVALUATED`; partial
gives `NEEDS_REVIEW`; mixed gives `NEEDS_REVIEW`; non-A4 page size fails on a real comparison and a
missing page size stays missing. It also derives the expected pass/fail from the rule's own declared
numeric range instead of assuming a value.

`Font_color_consensus_requires_every_run_to_be_known` pins the four colour rows above.

Two of my own test assumptions were wrong and were corrected rather than asserted around: I assumed
15 mm violates the ND30 right margin (it does not — the rule's declared range accepts it), and I
assumed 12240x15840 twips resolves to `Letter` (the resolver labels it `custom:`). I also had to fix
my section builder, which appended `ParagraphProperties` straight to the body so the parser never saw
multiple sections — the partial and mixed cases were untestable until that was corrected.

## 8j. Receipts — rounds r6/r7/r8

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (r8, isolated procbuild OutDir) | 0 - 0 errors, no CS8600 |
| PROC_BUILD_EXIT (r8, fresh, before tests) | 0 |
| PROC_TEST_EXIT (r8 targeted) | 0 - **81 passed** |
| WEBAPP_TSC_EXIT (r7) | 0 |
| WEBAPP_TARGETED_EXIT (r7, server + UI document-formatting) | 0 - 50 passed / 7 files |
| `git diff --check` Processor / worktree | 0 / 0 |

Pre-fix evidence retained: `r6-build-pre.log`, `r6-build-pre2.log`, `r6-build-pre3.log`, `r6-pre.log`
(both new tests failing against r5), plus `r6b-*`, `r6c-*`, `r7-*`, `r8-*` and all earlier receipts.
Nothing deleted or overwritten.

Source fingerprints: `FormattingObservationAdapter.cs` `60e082cfafd47e8a`,
`FormattingPropertyMutationExecutor.cs` `17173c4eb7725c2a`, `FormattingProfileV1Tests.cs`
`0ba14500371382e2`. Counts unchanged: main clean, worktree 26, Processor 25.

### Deferred to the next stage, as scoped

Composite `national_header_motto_block` / `issuer_block` line keys, the `recipient_list_label` role,
and non-body role consensus are **not started** this turn. No full release-pack producer audit was
run.

## 8k. r9 — theme colour, style-cycle accounting, Letter page size

### Theme-resolved colour was read as a definite black — FIXED

`DocxParser.F.Run` read only `W.Color.Val` and ignored `themeColor` / `themeTint` / `themeShade`.
Word still writes a `Val` when the real colour comes from the theme, and that cached value is very
often `000000`, so a themed run was reported as a resolvable black and passed the ND30 black rule.

The parser now emits an explicit unresolved marker (`theme:unresolved`) whenever a theme attribute
is present. The marker is deliberately **non-null**, so style inheritance cannot replace it with an
inherited value, and `ResolveExplicitColor` maps it back to unknown. Provenance therefore survives
from the parser boundary to the adapter.

### A style-inheritance cycle did not count as an unknown colour — FIXED

`ObserveDocumentDefaults` caught `StyleInheritanceCycleException` and marked only
`document.effective_font_family` uncertain, then skipped the run entirely. The skipped run was not
counted, so known black plus a cycle resolved to a single known colour and falsely PASSED. The
catch now also records the run as an unknown colour, so completeness is preserved.

### US Letter constants were wrong — FIXED

`ResolvePageSize` compared against 21590 x 15240 twips, which is not Letter. US Letter is
12240 x 15840 twips, so a genuine Letter document was labelled `custom:` and the page-size rule
failed for the wrong reason. Only that constant was corrected; no other paper size was added.

Regressions `Theme_resolved_font_colour_is_never_reported_as_black` and
`Us_letter_page_size_is_recognised` cover: all-theme runs are `NOT_EVALUATED` with nothing
published; known black plus a themed run is `NEEDS_REVIEW`; explicit black with no theme attribute
is still a genuine resolvable `black` that PASSES; Letter is labelled `Letter` and fails the A4
rule; A4 is labelled `A4` and passes.

An earlier filter string for the first run of these tests was malformed
(`FullyQualifiedName~A|~B`) and matched nothing, so its exit code was meaningless. It was replaced
with a correctly formed filter and re-run, and only the 2-test result from the corrected run is
claimed.

## 8l. Receipts — round r9

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (isolated procbuild OutDir) | 0 - 0 errors, no warnings |
| PROC_BUILD_EXIT (fresh, before tests) | 0 |
| PROC_TEST_EXIT (targeted) | 0 - **83 passed** |
| WEBAPP_TSC_EXIT | 0 |
| WEBAPP_TARGETED_EXIT (server + UI document-formatting) | 0 - 50 passed / 7 files |
| `git diff --check` Processor / worktree | 0 / 0 |

Persistent receipts added this round, none deleted or overwritten: `r9-build.log`, `r9-build2.log`,
`r9-target.log`, `r9-target2.log`, `r9-targeted.log`, `r9-solbuild.log`, `r9-webapp-tsc.log`,
`r9-webapp-targeted.log`.

Source fingerprints: `DocxParser.cs` `647c1dc97ae22b2d`,
`FormattingObservationAdapter.cs` `c8cecf6d3403182f`, `FormattingProfileV1Tests.cs`
`bf59208e951e68bf`. Counts unchanged: main clean, worktree 26, Processor 25.

### Not started this round — remaining adapter semantic defects

| Item | Status |
|---|---|
| (A) Non-body role formatting consensus across all runs of a role | **not started.** Needs an adapter-scoped consensus replacing first-run/last-write behaviour, reusing the existing resolver and rollup. |
| (B) Composite `national_header_motto_block` and `issuer_block` line producers | **not started.** Needs the NationalHeader+NationalMotto and IssuingAuthorityParent+IssuingAuthority paragraph sets aggregated unit-safely. |
| (C) `recipient_list_label` role separated from `recipient_list` formatting | **not started.** The detector's `RecipientList` is the lexical label; the label must be observed under its own role and excluded from list formatting, without collecting arbitrary following paragraphs. |

No rule, enum or catalog change was made in this round, and no subset or assertion was reduced.

## 8m. Stage A — non-body role formatting consensus (INCOMPLETE, acceptance not demonstrated)

Production code for stage A is in place, its acceptance test now exists, and a narrow run of that
test plus the two eligibility tests passed 3/3 (`r14c-targeted.log`). **Stage A is still NOT fully
accepted**: `uppercase` role formatting is not covered, and the broader targeted suite has not been
re-run since the stage A production edits, so no claim is made beyond the narrow cases listed in 8o.

### What was implemented

`ObserveRoleFormattingConsensus` re-derives role formatting for `NationalHeader`, `NationalMotto`,
`IssuingAuthorityParent`, `IssuingAuthority`, `IssuePlaceAndDate`, `DocumentTypeHeading`,
`SubjectNamedDocument`, `SubjectOfficialLetter`, `LegalBasisBlock`, `Addressee` and
`RecipientList` from **every run of every paragraph the detector assigned to that role**, rather than
one representative run:

- all runs known and identical -> observed;
- any run unknown, values differ, or the evidence is ambiguous -> `MarkUncertain` (NEEDS_REVIEW);
- no run known -> nothing published (NOT_EVALUATED).

Ambiguity is taken from the detector's own fields: more than one component for the role, confidence
below 1.0, status other than `CONFIRMED`, or a non-empty `CompetingCandidateIds`.

Paragraphs are located by exact id across **all source kinds** — top-level body, table cells,
headers and footers — via `AllParagraphsById`, so a role paragraph is found wherever the document
actually put it.

To satisfy "clear/skip copied representative formatting", the merge loop now **skips copying** the
component builder's representative values for these role/property keys, and an unknown consensus
explicitly removes any stale key from `ObservedValues`. An unknown consensus therefore cannot leave
an old false PASS behind. `EffectiveFormattingResolver` is reused; no detector or evaluator code was
rewritten and no default value is fabricated.

### Known limitation of this change

`EffectiveFormatting` exposes no `uppercase`, so uppercase **cannot** be re-derived here. It was
deliberately left out of both the consensus property list and the skip list: including it in the skip
list would have silently dropped a real uppercase observation. Uppercase role formatting therefore
still comes from the component builder's representative run and is **not** covered by stage A.

### Receipts — round r10

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (isolated procbuild OutDir) | 0 - 0 errors |
| PROC_BUILD_EXIT (fresh, before tests) | 0 |
| PROC_TEST_EXIT (targeted) | 0 - 83 passed, no regression |
| `git diff --check` Processor | 0 |

Adapter fingerprint `c8d1530090f4ca0c`. Processor repo still 25 changed entries. Persistent receipts
added: `r10-solbuild.log`, `r10b-solbuild.log`, `r10b-build.log`, `r10b-targeted.log`.

Two build failures during this stage were mine and are recorded rather than hidden: a first attempt
referenced a non-existent `EffectiveFormatting.Uppercase`, and a second used a null check on the
non-nullable `double Confidence`. Neither was worked around by suppressing a warning.

### Outstanding for stage A acceptance

None of the required acceptance cases were written: mixed-run heading (first run correct, second
wrong -> NEEDS_REVIEW), homogeneous heading true result, two same-role `LegalBasisBlock` paragraphs
in reversed order with no last-write, unknown/missing evidence, semantic ambiguity, and a table-cell
role resolved through real source-kind lookup. Until those exist and pass, the behaviour above is
unverified by test and stage A stays open.

Stage B (composite `national_header_motto_block` / `issuer_block` line producers) and stage C
(`recipient_list_label`) were not started this turn, as instructed. The final boundary webapp rerun
is still planned once A, B and C are all complete; no webapp suite was rerun this turn because the
change does not alter the JSON contract shape.

## 8n. Eligibility binding — RuleId cardinality verified, not assumed

The eligibility mapping (`DocumentProcessorService.AppliesToAMutationTarget`) binds a finding to an
apply offer by comparing `ProfileMutationTarget.RuleId` with `ValidationResult.RuleId`. That is only
sound while one rule id declares at most one mutation target, so the invariant is now asserted in
`Eligibility_is_bound_by_rule_id_so_target_backed_findings_are_not_downgraded` rather than assumed:

- no rule id declares more than one mutation target;
- no property is declared more than once.

Measured on the current profile: **11 mutation targets, 11 distinct rule ids, 11 distinct
properties**, so the 1:1 association holds today. If a future target ever reuses a rule id for a
second property, RuleId-only matching would qualify a finding on the strength of a target belonging
to a different property, and the new assertion fails.

Property equality is deliberately **not** also required. The catalog and the profile use different
vocabularies for the same quantity — the rule targets `paragraph_spacing_pt` while the target is
`paragraph.spacing_after_pt` — so requiring both to match would reject genuinely applicable findings
and re-introduce exactly the blanket downgrade this guard exists to prevent. RuleId is the only
sound association, and it is now pinned by cardinality assertions.

Confirmed behaviour in this round:

- `ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN` and `ND30.PL1.I.II.6E.BODY_LINE_SPACING_RANGE` produce real
  target-backed findings and are **not** downgraded;
- `ND30.PL1.I.GENERAL.FONT_FAMILY` has no declared target and stays `SUGGEST_ONLY` with no apply
  offered — the fail-closed case;
- no rule id maps to more than one property.

## 8o. Receipts — rounds r13/r14

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (r13, isolated procbuild OutDir) | 0 - 0 errors, no warnings |
| PROC_BUILD_EXIT (r14, fresh, before tests) | 0 |
| PROC_TEST_EXIT (narrow: eligibility + font-family + stage A consensus) | 0 - **3 passed** |

An earlier run of the same narrow filter reported `3 total, 1 failed` (`r13-targeted.log`). The cause
was a **hard-coded paragraph-id assumption in the test's lookup**, not a defective DOCX fixture and not
a production defect: the test bound to `p8` while the parser numbered the table-cell paragraph
differently, so it read the wrong paragraph's size. The id is now read from the parsed document
(`Tables -> Rows -> Cells -> Paragraphs`) instead of assumed, and the case passes.

All build and test logs live in the shared temp workspace
`C:\Users\dtron\AppData\Local\Temp\opencode\`, **not** in the project worktree:
`r13-solbuild.log`, `r13-build.log`, `r13-targeted.log` (the failing run),
`r14-build.log`, `r14-targeted.log`, `r14b-build.log`, `r14b-targeted.log` (build error: tuple
deconstruction bound the wrong element), `r14c-build.log`, `r14c-targeted.log` (green).
`r12-solbuild.log` is 0 bytes and is retained as evidence that the interrupted build never completed.
Nothing was deleted or overwritten.

Source fingerprint: `FormattingProfileV1Tests.cs` `d24bc765ac018d10`. Counts unchanged: main clean,
worktree 26, Processor 25. `git diff --check` exit 0.

No webapp suite was rerun: this round changed no JSON contract shape. The planned boundary rerun
still waits until stages A, B and C are all complete.

## 8p. Stages B and C — implemented, tested, still PARTIAL

Both stages were done test-first: the acceptance test was written and run against the code **before**
the production change, and failed for the right reason each time.

### Stage B — composite line producers

`ObserveCompositeLineConsensus` publishes `semantic_component.national_header_motto_block.line_spacing`
from `NationalHeader` + `NationalMotto`, and `semantic_component.issuer_block.line_spacing` from
`IssuingAuthorityParent` + `IssuingAuthority`.

Unit-safe by construction: it reads only the per-paragraph `line_spacing_lines` observation, which
exists solely for `lineRule="auto"`, so an absolute `exact`/`atLeast` spacing can never be turned into
a line verdict. Outcomes: a required role absent, a contributing paragraph with no line multiple, or
disagreeing multiples -> uncertain (NEEDS_REVIEW); no line multiple anywhere -> nothing published
(NOT_EVALUATED); one agreed multiple -> observed. It runs after `ObserveParagraphTargets`, which is
what produces the per-paragraph values it consumes.

`Stage_b_composite_role_line_producers_are_unit_safe` pins all six cases, including both composite
blocks. RED receipt: `r15-red2.log` (no observation for the composite key). GREEN: `r16-green.log`.

### Stage C — recipient label is not list formatting

`PublishedRoleKey` publishes the detector's `RecipientList` component under
`recipient_list_label`, because that component is the lexical label paragraph, not the list. The
label's formatting is therefore judged by the label rule, and `recipient_list.*` is left unobserved
instead of being judged against rules written for the entries. No following paragraph is guessed at:
the real list stays honestly unobserved pending a bounded detector change. When the consensus is
unknown, both the published key and the list key are cleared so no stale value survives.

`Stage_c_recipient_label_is_observed_as_its_own_role` pins the label observation, the absence of any
`recipient_list` observation, and the absence of an invented list.

Receipts, corrected:

- RED before the Stage C production change: `r17-red.log` (exit 1, no observation for the label key).
- `r18-targeted.log` was **exit 1 — 4 passed, 1 failed**. It is not a green receipt. The single
  failure was the Stage A ambiguity assertion, which still expected the old `recipient_list` key
  that Stage C deliberately stopped publishing; Stage C itself was not at fault.
- After that assertion was updated to the label key, the actual green receipt is
  **`r20-targeted.log` — exit 0, 86 passed**.

### Receipts — rounds r15 to r20

All logs are in `C:\Users\dtron\AppData\Local\Temp\opencode\`, not the worktree.

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (r20, isolated procbuild OutDir) | 0 - 0 errors, 0 warnings |
| PROC_BUILD_EXIT (r20, fresh, before tests) | 0 |
| PROC_TEST_EXIT (targeted: profile/apply/mutation/service) | 0 - **86 passed** |
| WEBAPP_TSC_EXIT | 0 |
| WEBAPP_TARGETED_EXIT (server + UI document-formatting, boundary rerun) | 0 - 50 passed / 7 files |
| `git diff --check` Processor / worktree | 0 / 0 |

This is the single planned boundary webapp rerun after A, B and C. The Processor targeted suite had
not been re-run since the stage A production edits until now; it passes at 86.

Logs added, nothing deleted or overwritten: `r15-*`, `r16-*`, `r17-*`, `r18-*`, `r19-*`, `r20-*`.

Two authoring incidents in this round are recorded for accuracy, and they are **not** both build
errors:

1. **Compile error.** `CS0283: The type 'LineSpacingRuleValues' cannot be declared const` — the Stage B
   test declared `const` locals of an enum type. Corrected to ordinary locals. Receipt:
   `r15-build-red.log`.
2. **Not a build error.** A PowerShell quoting failure stopped a patch command from running at
   all. No compiler was involved, no build was attempted, and no file was changed by it. The same
   edit was then applied successfully from a script file. Receipt: none, because no command ran.

Full SHA-256:

- `FormattingObservationAdapter.cs` = `4981A957C669DBCADA6C5D97E4B6970411FB6D4AE3C8299F9FE9FBA9892A6DF1`
- `FormattingProfileV1Tests.cs` = `CE637FE8FF9C501F25688B7475E526EC2BCA9653BAE0D5991B194D0409D92437`

Counts unchanged: main clean, worktree 26, Processor 25.

### Stage status — deliberately not upgraded

| Stage | State |
|---|---|
| A | acceptance test exists and passes; **uppercase role formatting still not covered**; the narrow cases are proven but the wider role matrix is not |
| B | acceptance test exists and passes for both composite blocks |
| C | acceptance test exists and passes for the label role; the real recipient list is still uncollected by the detector |

None of these is a full release-pack audit, and no claim is made that the ND30 formatter scope is now
complete.

## 8q. Stage B reopened — two P2 fail-open cases found by independent review and fixed

Independent read-only review of `ObserveCompositeLineConsensus` found two ways it could publish a
verdict its evidence did not support. Both are fixed, both were proven by a failing test first, and
Stage C behaviour was not touched.

### Finding 1 — uncertainty signals were not propagated

The composite producer did not carry over the checks the single-role consensus performs. Two role
labels that were only low-confidence inferences, carried competing candidates, or were named by an
explicit `semantic.Ambiguities` entry still published a block verdict whenever their line values
happened to agree. Agreement between two uncertain labels is not a fact.

### Finding 2 — blank paragraph ids were filtered out

A required role satisfied the block if it had *any* candidate with a usable id. A role with one
usable candidate plus one candidate with a blank `ParagraphId` therefore counted as satisfied and
published a consensus built from part of its evidence.

### Fix

`ObserveCompositeLineConsensus` now requires every required role to exist **and** every candidate of
that role to carry a usable paragraph id; any unusable candidate makes the block uncertain rather
than partial. It then applies the same uncertainty signals as the single-role consensus — a
contributing candidate that is `INFERRED_LOW`, carries a non-empty `CompetingCandidateIds`, or is
named by a declared ambiguity marks the composite uncertain. Nothing is invented and no verdict is
published from incomplete evidence.

### Regression

`Stage_b_composite_block_fails_closed_on_uncertain_evidence` proves all four cases produce
uncertainty: low-confidence inference, a competing candidate, an explicitly declared ambiguity, and a
role with one usable plus one blank-id candidate. The pre-existing Stage B cases (single agreed value
observed, disagreement, mixed units, all-absolute, absent role, and the issuer block) are preserved
unchanged.

RED receipt: `r21-red.log` (exit 1). GREEN: `r21-targeted.log`.

## 8r. Receipts — round r21

All logs are in `C:\Users\dtron\AppData\Local\Temp\opencode\`.

| Gate | Exit |
|---|---|
| PROC_BUILD_EXIT_SOLUTION (`DocumentEngine.slnx`, Release, isolated procbuild OutDir) | 0 - 0 errors, 0 warnings |
| PROC_BUILD_EXIT (test project, fresh) | 0 |
| STAGE_TARGETED_EXIT (Stage A + Stage B x2 + Stage C + eligibility x2) | 0 - 6 passed |
| PROC_CLASS_FILTER_EXIT (profile/apply/mutation/service) | 0 - **87 passed** |
| `git diff --check` Processor | 0 |

The class filter count moved 86 -> 87 with the added Stage B regression. No webapp suite was rerun:
the JSON contract shape is unchanged, and Stage C behaviour is untouched by this fix.

Logs added, failed receipts kept: `r21-build-red.log`, `r21-red.log`, `r21-solbuild.log`,
`r21-build.log`, `r21-targeted.log`, `r21-targeted-class.log`.

SHA-256 as of this round:

- `FormattingObservationAdapter.cs` =
  `6433CC4F63092669CD905BA88CD0A011D0992FE944E1940C84A72088CA020E53`
- `FormattingProfileV1Tests.cs` =
  `FC4E238E9A71605293798376C086FEBBA36C44B2F63B1D1C6584256585266336`

**Correction:** the earlier statement that the test file was unchanged from 8p was false. It
changed in this round because `Stage_b_composite_block_fails_closed_on_uncertain_evidence` was
added, so the digest above is the current one and includes that regression. The 8p digest
`CE637FE8FF9C501F25688B7475E526EC2BCA9653BAE0D5991B194D0409D92437` is retained in 8p as the
historical value for that round only.

### Stage status after this round — still honest, still partial

| Stage | State |
|---|---|
| A | acceptance test exists and passes; **uppercase role formatting still not covered**; wider role matrix unproven |
| B | both composite blocks covered, now including fail-closed behaviour for uncertain and partially identified role evidence; not a full release-pack audit |
| C | label role covered; the real recipient list is still not collected by the detector and stays unobserved |

## 9. Honest limits

- **Live signed-in UI pilot: BLOCKED / NOT RUN, and it stays that way after a server restart.**
  This environment issued a **hard policy denial** on browser access. The webapp console is also not
  running, but that is not the binding constraint: the denial applies regardless of whether the
  server is up, so restarting it changes nothing. No UI interaction was driven by this runner; React
  is covered by component tests with a mocked capability registry, and that is the only UI evidence
  claimed here.
- **Font family is not applied.** The ND30 font-family rule is evaluated and reported; there is no
  safe apply path for it in this build, so no font-family mutation evidence exists.
- The host process on `:5080` is a stale build (see 8b); metadata receipts come from a fresh
  out-of-band build.
- Root cause of the user's original error remains UNCONFIRMED.
- A dead observation key (`semantic_component.body.line_spacing`) meant the ND30 body line-spacing
  rule never evaluated for any document until this round; see 8d. Other rules may still have
  unproduced observation keys, and no audit of every release-pack rule against an actual producer
  has been done. That is the main outstanding technical risk.
- This is one property (right margin) on synthetic documents. **No legal-compliance claim.**
  `fullComplianceClaimAllowed=false` on every fixture.
- HD05/party documents remain refused (fail-closed) and are not covered by any positive test.

## 10. Single decision gate

1. Restart the webapp console with its own environment **and restart the Processor on `:5080`** so
   both run the current build. This is needed so the running services are not stale; it is **not**
   expected to enable the signed-in UI pilot, which stays blocked by the browser policy denial
   described in section 2 and cannot be unblocked by a restart.
2. Company profile: HD05 routing, `1.0.0-provisional` values, template set, issuing
   authority/regime per type, and the Firestore `document-formatting.enabled` flag for a live smoke.
3. Font family, if it is ever to be applied, needs its own scoped decision: which package parts are
   in scope (body, tables, headers, footers), whether inherited fonts may be overridden, and a
   preservation proof. It is not a formatting tweak and should not be smuggled in with the margin
   work.
