# M1 — ND30 Targeted CI Evidence Ledger

Status: **BLOCKED until observable GitHub Actions execution and required negative gates are green**.

## Authority and immutable reference points

| Item | Verified value | Evidence |
|---|---|---|
| Production | quanggiaphthh/Agent-Workspace | GitHub connector |
| Production main at audit start | \`7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1\` | GitHub ref |
| CI branch | \`task/m1-nd30-ci-evidence-20261014\` | GitHub ref |
| Original CI-workflow commit | \`c47200656ebe33637c83e8b64e8a16c6643cfd3e\` | GitHub commit |
| Workflow | \`.github/workflows/m1-nd30-targeted.yml\` | GitHub file |
| Rule authority main | \`078dae21f9e23975676179fa189f5c01b605f49a\` | GitHub ref |
| Technical reference only | tranhaihp26-bit/Docs-ND30 | No checkout/build/token required |

The ND30 rule authority is an already-reviewed business-rule source. Do not rerun primary decree analysis. Select only document-formatting rules; do not expand Party, Hướng dẫn 05, PDF or M2–M5 scope. No Firebase Storage/Firestore documents.

## Historical blocker reconciliation

- \`DOCS_ND30_READ_TOKEN\`: **NOT REQUIRED** for this canonical-only M1 workflow, not a valid M1 blocker.
- Previous requirements to checkout/build Docs-ND30: **SUPERSEDED**.
- Prior assertions about official-law re-review as an M1 prerequisite: **SUPERSEDED by locked rule authority**.
- Earlier M1 PASS assertions without exact run SHA, CI logs or observed negative tests are **INVALID**.
- Nine M1 reports were previously distributed as a ZIP artifact; those nine individual reports are **NOT PRESENT in the inspected CI branch tree**. They cannot be silently claimed updated. Their archived conclusions must be reconciled when source files are made accessible.

## Test inventory and evidence status

| Gate | Implemented or selected evidence | Execution status |
|---|---|---|
| Baseline/ref and workflow | Ref/commit and contents verified directly | PASS (read-only verification) |
| Build and worker ESM/CJS | \`npm run build\`, \`node --check\` | PENDING CI |
| Existing document/package security | \`docxPackage.test.mjs\` now included in targeted selection | PENDING CI |
| API/Auth/owner permission | Existing source tests plus new missing-context/identity tests | PENDING CI; HTTP-level coverage requires review |
| Module enable/disable | Regression plus re-enable/rollback negative tests | PENDING CI |
| Four worker operations | Invalid/truncated DOCX and fail-closed worker probes | PENDING CI |
| ZIP bomb and malformed DOCX | Programmatic high-ratio archive and corrupted payload | PENDING CI |
| Input resource limits | >20 MiB payload; deadline validation | PENDING CI |
| Worker timeout and concurrency | 1ms deadline, PROCESSOR_BUSY | PENDING CI |
| XSS output rendering | Hostile API error text in real React module | PENDING CI |
| Administrative data no-fabrication | Compare w:t payload before/after bounded formatting | PENDING CI |
| Deployment and storage prohibition | No deployment, no new persistence | Scope invariant |
| Visual fidelity/manual QA | Not included in targeted CI | NOT_EVALUATED |

## Commands and exact result fields

Workflow executable commands:
- \`git rev-parse HEAD\`
- \`git merge-base --is-ancestor 7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1 HEAD\`
- \`npm ci --ignore-scripts --no-audit --no-fund\`
- \`npm run build\`
- \`node --check server/modules/document-formatting/docxWorker.mjs\`
- \`node --check dist/docx.worker.cjs\`
- \`./node_modules/.bin/vitest run "\${tests[@]}"\`
- Worker invalid-input probe in Node ESM

Observed run ID: **NOT YET AVAILABLE**
Observed final run SHA: **NOT YET AVAILABLE**
Observed commands/exit codes and logs: **NOT YET AVAILABLE**

Do not infer exit code zero from a successful GitHub API write. Obtain logs and per-step conclusions from the actual run. Reconcile this ledger only after verified execution.

## Final gate

**BLOCKED** until exact branch HEAD, run ID, jobs/steps, exit codes, logs, full required negative coverage, and nine-report conclusion reconciliation are evidenced. No main merge, deploy, M2–M5, Party/HD05, PDF or file persistence changes.
