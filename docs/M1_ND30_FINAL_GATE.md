# M1 — Final Gate: BLOCKED (evidence pending)

Production: \`quanggiaphthh/Agent-Workspace\`
Rule authority: \`quanggiaphthh/chuan-hoa-van-ban-nghi-dinh-30\`
Reference-only: \`tranhaihp26-bit/Docs-ND30\`
Verification branch: \`task/m1-nd30-ci-evidence-20261014\`

## Superseded conclusions

\`DOCS_ND30_READ_TOKEN\` is **not mandatory**. Docs-ND30 must not be checked out or built by M1 CI. Revalidating the primary decree/Party rules and expanding PDF scope are not M1 requirements. A missing Docs-ND30 private token cannot block this canonical-only workflow.

## Current verification

- Original workflow commit \`c47200656ebe33637c83e8b64e8a16c6643cfd3e\` and production baseline \`7adc5f3dbbe5ccd834cd912a7ecda3f1eae27ef1\` were verified through GitHub.
- Rule authority main \`078dae21f9e23975676179fa189f5c01b605f49a\` was verified.
- New targeted negative tests are committed on the CI branch; implementation commits alone are **not test evidence**.
- No completed M1 workflow run/log has been verified at this checkpoint.
- Original archive containing 9 M1 reports was not found inside the CI repository tree; those documents were not represented as individually synchronized.

## Gate condition

M1 = **BLOCKED** until (1) M1 workflow run ID, head_sha and complete job logs are observed; (2) build, worker, API/Auth, module lifecycle, corrupted DOCX/ZIP-bomb/resource, timeout, XSS and administrative data tests pass at that SHA; (3) pending 9-report conclusions are reconciled without unsupported claims.

Failure of a test is not permission to weaken a gate. Patch minimal errors only on CI branch, re-run affected tests, and keep any unresolved issue as BLOCKED.

No merge, deploy or out-of-scope feature work.
