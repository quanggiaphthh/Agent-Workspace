# GĐ4 LƯỢT 2B — MINIMAL CORRECTIVE

## Canonical failing commit
`37b29c8432222f62c334dd8165ad3e6ec0d2deb1`

GitHub Actions run: `35573383009`

## Root cause
`shared/contracts/fileUploadPolicy.ts` remains the canonical definition of `SupportedFileMimeType`.

`server/core/files/filePolicy.ts` imported that type for its own implementation but stopped re-exporting it. Existing `UserFileService.ts` still imports the type from `./filePolicy`, producing TS2724.

## Minimal corrective
Changed production file: `server/core/files/filePolicy.ts`

Exact semantic diff:

```diff
 export { MAX_FILE_BYTES, SUPPORTED_FILE_MIME_TYPES };
+export type { SupportedFileMimeType } from '../../../shared/contracts/fileUploadPolicy';
```

No duplicate type definition was introduced. Runtime behavior, MIME allowlist, 20 MiB limit, UserFileService, FileIngestionService, frontend behavior, and locked architecture are unchanged.

`PRODUCTION_SOURCE_MANIFEST.sha256` was updated only for the changed production file hash.

## Manifest
- entries: 138
- matched: 138
- mismatch: 0
- missing: 0
- result: PASS

## Runtime verification
A clean `npm ci --no-audit --no-fund` was attempted before any GitHub write.

Result: execution-environment transport timeout before dependency installation completed.

Therefore TypeScript, targeted L2B, L2A, L1, Capability Bridge, Full Vitest, QA Stage 1–5, and production build were not run and are not claimed PASS.

Because local verification was an explicit prerequisite for commit/push, no GitHub commit or push was performed.

## GitHub status
Commit SHA: NOT CREATED.

## Verdict
MINIMAL CORRECTIVE PREPARED — LOCAL RUNTIME VERIFICATION BLOCKED.

Do not declare GĐ4 Lượt 2B FINAL PASS. Run the corrective in an environment where npm ci completes; execute all required gates; only then commit/push and wait for canonical GitHub Actions verification.
