# H1 Candidate File Operations

Baseline: `332dfbf10983b015526e9397b696913628350560`

This is an operation-based review candidate. The connected canonical-repository
reader can inspect but cannot materialize complete large existing files such as
`server.ts` and `package-lock.json` without performing prohibited Git operations.
For those files the candidate therefore carries a deterministic integration aid
that performs only the exact H1 textual deltas and fails closed on baseline
mismatch.

## ADD

- `server/types/express.d.ts`

## MODIFY

- `server.ts`
  - replace every exact F03 token `(req as any).user` with `req.user`
  - replace every exact F03 token `(req as any).requestId` with `req.requestId`
  - do not touch unrelated `as any` casts
- `package.json`
  - package name `react-example` → `agent-workspace`
  - remove `vite` from runtime `dependencies`
  - retain `vite: ^6.2.3` in `devDependencies`
  - no other dependency/script/version change
- `package-lock.json`
  - synchronize the two root/workspace package-name metadata fields
  - remove only the root-package runtime-dependency declaration of Vite
  - retain the existing resolved Vite package and devDependency declaration
  - no resolution/integrity/version refresh
- `README.md`
  - replace AI Studio starter README with bounded Agent-Workspace developer/operator README

## DELETE

- `bun.lock`

## REVIEW-ONLY INTEGRATION AID — DO NOT COMMIT

- `H1_APPLY_CANDIDATE.py`
- `H1_CANDIDATE_FILE_OPERATIONS.md`

The apply aid must be run only against the exact reviewed baseline and is not
canonical project source.

## Invariants

- No dependency added.
- No dependency upgraded/downgraded.
- `vite` remains exactly `^6.2.3`, only as a devDependency.
- npm + `package-lock.json` becomes the sole package-manager/lockfile authority.
- F03 reuses canonical `UserContext`; `Request.user` is optional because public/unauthenticated request paths do not receive identity; no parallel identity object or auth authority.
- Authenticated routes continue to rely on existing middleware/guards; no non-null assertion, fallback identity, or auth-semantic change is introduced.
- Request authentication/authorization/requestId runtime semantics are unchanged.
- `bun.lock` deletion is mandatory; retaining it leaves F06 unresolved.
