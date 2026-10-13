# CI Stage 4C corrective patch manifest

- Repository: `quanggiaphthh/Agent-Workspace`
- Required base commit: `3a9ac564f6916fa8c9849ed3b0a3f13a9ab31fef`
- Full replacement file: `scripts/qa-stage4c.mjs`
- SHA-256: `9151702ea181043975501865604075ee1fb5098cc7e965693b08f8b0da848647`
- Scope: QA-only static invariant and CI diagnostics; no application runtime behavior changes.
- Root cause: the Stage 4C assertion searched only 1,200 characters from the module toggle route. The release-gate branch made the generic toggle call 1,299 characters from the route start, causing a false negative while both persistence helpers still used Firestore `runTransaction` and `AuditService.stageLog`.
- Local verification: Node v24.19.0, `node scripts/qa-stage4c.mjs` PASS 42/42; `git diff --check` PASS.
- Existing GitHub Actions run at the base commit failed at QA Stage 4C; the full workflow must pass on a new commit before CI can be marked green.

This file is package metadata. Do not copy it into or commit it to the repository.
