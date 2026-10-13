# Document Formatting V1 patch manifest

- Base repository: `quanggiaphthh/Agent-Workspace`
- Required base commit: `0c38b8ccb8fca422adfdeb431bcd77c7a69ab5b6`
- Patch files: 23
- Package type: complete file replacements/additions at repository-relative paths; overlay onto the exact base commit.
- This archive does not include `.git`, generated build output, credentials, or the full repository.

## Files and SHA-256

| Repository path | SHA-256 |
| --- | --- |
| `package-lock.json` | `0eea6d5f689b36328813d4e8c97fd1f94ec17b96b5677173d29f3de5b7191c8c` |
| `server.ts` | `f02c69087faad1e21b9093c9d4f05519f5987c0c8c81822d6a6c9a7efdb88b5f` |
| `server/agent/adk/RootAgent.ts` | `5fc744a668145926afe624d5eeba2e25d763beb41a4ea2578ce46f9306963892` |
| `server/core/capabilities/CapabilityExecutionService.ts` | `5e7bf16fbdbd2a9925c389bbf558987af9a6342bb6b2f4b136fbaaf7daf25a54` |
| `server/core/capabilities/SafeCapabilityExecutionError.ts` | `6fbf51b658a65ae26fac3df164b9599aef71fbf9620f5708ba85b14b65f9e5d9` |
| `server/core/capabilities/__tests__/capabilityContract.test.ts` | `c477104f10cf18a6eecdad200f6a82bec0f819cdddc14341e3a31afa1610c763` |
| `server/core/capabilities/__tests__/executionIdempotency.test.ts` | `83836388262b7465397489c687a42e924d6bae30c5d31574af194fdb077204b0` |
| `server/core/capabilities/serverCapabilityRegistry.ts` | `41d7a5e6cae235e03d6711dedd0b143db3064b3a70903bac03c3d67b6662138b` |
| `server/core/documents/__tests__/requestScopedDocument.test.ts` | `902a71fea01b146d0c832d292a847b261a8e36a60e36cb1829388d055ec0d42b` |
| `server/core/documents/requestScopedDocument.ts` | `0e1c54bda6891a2e2954a021b6d524f300151b31fa722ab089cc32e1812001cd` |
| `server/core/modules/moduleCatalog.ts` | `1e8766011c807ad0e3e22b237a6ae310e9e00be0e3b99de90281253adda7b95f` |
| `server/infrastructure/storage.ts` | `7a290ed794c2fb161490fa7f0ae9f185a33e72efea94985771382ff31a83fa39` |
| `server/modules/document-formatting/registration.ts` | `01c4262bdd4428c539aa26726f697718135706cb70c38fcb5301e255b3deff26` |
| `server/modules/document-formatting/releaseGate.test.ts` | `62afe613b839a58a5e33c70a36af514f6d156be4d500f9f1d68d547e662120e9` |
| `server/modules/document-formatting/releaseGate.ts` | `7ed5bf0279f8a5c251a15c8de9ab61ec6666173de661e75401a69a5789027269` |
| `shared/contracts/capability.ts` | `ab736958d09b3b0e8056f650d9271d577737813f3d8324cd2cef7add65f15fe9` |
| `shared/contracts/module.ts` | `f598e780033747bfe27d90eaab215405e7431d63f062a27ad1390df9dd64f9a6` |
| `src/__tests__/architecture.test.ts` | `d14ea0cfc129204d66b67091769ea3dade884f482e752ce5a54597d95f38085a` |
| `src/__tests__/integration.test.ts` | `3f6ec345a8307840198ea1227b988f6dc95607d559bb6910e51db84f43eb5b01` |
| `src/core/modules/moduleRegistry.ts` | `b385ad490e5a47cb5aeae7c180a23e71b8e9ee8a7a6e133ea83633079cd667a6` |
| `src/modules/document-formatting/DocumentFormattingModule.tsx` | `cf5f60d27bfcda452813cf62b27ac3dddac7db8e0db09bb5892f964efcaa51d0` |
| `src/modules/document-formatting/manifest.ts` | `5a7b3da551f8808c5e7ee0ca27b2c790efadcc15d502df5fa5c75ccf7ee66c5e` |
| `src/modules/settings/ModuleManagerTab.tsx` | `426bba3946fbffcea31050a833b2b56379122d2a9ffa78157e8fc0fb5baee81f` |

## Verification evidence recorded for this patch

- `git diff --check`: PASS.
- `npm run lint`: PASS.
- `env VITE_FIREBASE_API_KEY=test-key npm test`: PASS, 59 files / 542 tests.
- `npm run build`: PASS; existing Zod annotation and large-chunk warnings were reported.
- `node scripts/security-audit.mjs`: PASS under repository policy; the existing temporary Firebase gRPC advisory acceptance remains active through its documented review date. This does not mean the dependency graph has zero advisories.
- `npm ls source-map-js`: resolved version is 1.2.2.
- Live processor deployment, production IAM, ephemeral-volume configuration, and production-like end-to-end verification were not available and are not claimed as passed.
- Document Formatting remains disabled by default and behind a manual release gate.
