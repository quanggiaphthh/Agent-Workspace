# Modular Agent Webapp v14 — Security Handoff

## Identity trust boundary

Firebase identity is verified server-side through `ServerIdentityProvider`. Protected API routes do not trust browser-provided user IDs, roles, permissions, admin flags, or confirmation booleans. Agent state identity fields are stripped and replaced with the verified server identity.

## Authorization

Authorization is enforced on the server through permission resolution, ownership checks, module state, and capability policy. Capability discovery and execution both apply policy; hiding a UI element is not treated as authorization.

Tasks/Memory REST routes use explicit permissions and user-scoped persistence. Capability execution also rejects unauthenticated guest identities for server-owned Tasks/Memory actions.

## Secrets

### Personal credentials

- Stored as versioned AES-256-GCM protected payloads.
- Protected payload includes version/algorithm/key ID/ciphertext/IV/authentication tag metadata; the encryption master secret is not stored in the document.
- Legacy plaintext/pre-GĐ4D AES records migrate transactionally and delete old plaintext/legacy fields.
- Migration/decrypt/backend configuration failures are fail-closed.
- Credential-list/read APIs return metadata, not plaintext or protected payload material needed only by the server.
- Browser persisted AI settings exclude saved credential secrets/lists.

### System credential

- Agent System Key is Google/Gemini only.
- Source is server-only `GEMINI_API_KEY`.
- System credential is not persisted in the user's credential collection and is not exposed through the user credential list.
- Personal credential rotation does not silently cross over to System Key.

## Encryption limitation

Current source has one active `CREDENTIAL_ENCRYPTION_KEY` and one effective key identifier (`CREDENTIAL_ENCRYPTION_KEY_ID`, default `env-v1`). There is **no multi-key decryption ring**.

Consequences:

- master-key replacement can make existing ciphertext undecryptable;
- rotation of the master encryption key must be a controlled migration operation;
- do not regenerate or change the key as an incident shortcut.

## Firestore security boundary

Two separate controls exist and must not be conflated:

1. **Firestore Security Rules** govern browser/client SDK access. Current Rules deny direct access to server-authoritative collections and default-deny all other paths.
2. **Firebase Admin SDK IAM/ADC** governs backend access and bypasses client Security Rules.

An Admin `PERMISSION_DENIED` issue is an IAM/ADC/service-identity problem, not a reason to weaken Firestore Rules.

## HITL

High-risk action confirmation is server-authoritative:

- caller-provided `confirmed:true` is ignored as an authorization decision;
- the server prepares a confirmation challenge bound to user, capability, and hashed input;
- challenge consumption occurs transactionally and is single-use;
- only the central gateway creates the `confirmed=true` execution context after successful challenge consumption.

## Audit

Audit is durable Firestore data. Security properties include:

- pending/pre-execution record before capability side effect;
- sanitized/redacted input/result/error metadata;
- tenant filtering in Firestore query before order/limit;
- module toggle and its audit entry in one transaction;
- no replay of a completed side effect merely because audit finalization failed.

## Provider failure / rotation boundary

Explicit provider status is authoritative for credential-rotation classification:

- 401 authentication → eligible to rotate;
- 403 authorization → no rotation;
- 429 quota/rate limit → eligible to rotate;
- 5xx transient → no rotation.

Rotation is disallowed after streaming has started and remains within active personal credentials for the same user/provider.

## Logging / error handling

Critical runtime/provider/audit paths use redacted/safe summaries. `/api/log-error` is schema/size/rate limited and sanitizes report fields. Fatal uncaught errors cause non-test process exit after redacted logging.

Do not add Authorization headers, cookies, Firebase tokens, provider keys, decrypted credentials, encryption master keys, or raw service-account payloads to logging/audit metadata.

## Known unverified security/runtime items

The final source package carries these verification blockers unchanged:

- **#17 Firestore IAM/ADC staging — BLOCKED (P1).** Live/staging service identity permissions were not verified.
- **#53 Firestore Rules Emulator — BLOCKED (P1).** Static deny policy was reviewed, but real Emulator Rules execution was unavailable.
- **#20 Full runtime/toolchain verification — BLOCKED (P2).** Full dependency/typecheck/Vitest/build evidence is not available; this is broader release-runtime evidence rather than a specific discovered vulnerability.

Security handoff must not relabel these items as PASS without new evidence.
