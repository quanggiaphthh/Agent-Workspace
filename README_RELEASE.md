# Modular Agent Webapp v14 — Release Candidate Handoff

`README.md` is part of the locked production-source digest and is intentionally unchanged in GĐ6. This file is the release/handoff entry point for the final source candidate.

## Classification

**FINAL SOURCE RELEASE CANDIDATE — WITH KNOWN ENVIRONMENT VERIFICATION LIMITATIONS**

Release matrix: **59 PASS / 3 BLOCKED / 0 FAIL**.

Blocked verification items:

- #17 Firestore IAM/ADC staging
- #20 Full runtime/toolchain verification
- #53 Firestore Rules Emulator verification

## Start here

1. Read `RELEASE_NOTES_V14.md` for scope and verification status.
2. Read `ARCHITECTURE_FINAL.md` for implemented architecture.
3. Read `SECURITY_HANDOFF.md` before provisioning secrets/IAM.
4. Follow `DEPLOYMENT.md` for lockfile install, environment configuration, verification, build, and start commands.
5. Keep `OPERATIONS_RUNBOOK.md` with the deployment/operations team.
6. Review `RELEASE_MATRIX_FINAL.md` and `FINAL_QA_STATUS.md`; do not treat BLOCKED items as PASS.

## Integrity / provenance

- Input GĐ5 Verification Supplement SHA-256: `db75cd4e431690336d2fcde2085ad4cb219353852ff7bfa980925a92f298d3b4`
- Locked production source digest: `9b1bbc7e3c8f72131aea3210df3a479ac03b0d3ee19d0e41812dc05efeab052a`
- `PRODUCTION_SOURCE_MANIFEST.sha256` covers the 97 locked production files.
- `SHA256SUMS.txt` covers the complete final source snapshot except the checksum manifest itself.

The final ZIP checksum is published as detached handoff metadata because an archive cannot reliably contain its own final cryptographic digest without creating a circular dependency.
