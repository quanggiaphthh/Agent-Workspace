import {
  evaluateConfirmationRecord,
  hashCapabilityInput,
} from '../server/core/capabilities/CapabilityConfirmationPolicy.ts';
import { sanitizeAuditValue } from '../server/core/audit/auditRedaction.ts';

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const userId = 'user-a';
const capabilityId = 'system.test.high-risk';
const input = { b: 2, a: 'same', nested: { z: true, y: [1, 2, 3] } };
const inputReordered = { nested: { y: [1, 2, 3], z: true }, a: 'same', b: 2 };
const inputChanged = { b: 3, a: 'same', nested: { z: true, y: [1, 2, 3] } };
const now = Date.now();
const inputHash = hashCapabilityInput(input);
const expected = { userId, capabilityId, inputHash };
const base = {
  userId,
  capabilityId,
  inputHash,
  expiresAtMs: now + 60_000,
  consumedAt: null,
};

check('normalized input hash is key-order stable', inputHash === hashCapabilityInput(inputReordered));
check('input binding changes when payload changes', inputHash !== hashCapabilityInput(inputChanged));
check('matching confirmation is accepted', evaluateConfirmationRecord(base, expected, now).ok === true);
check('confirmation is bound to user', evaluateConfirmationRecord(base, { ...expected, userId: 'user-b' }, now).errorCode === 'CONFIRMATION_USER_MISMATCH');
check('confirmation is bound to capability', evaluateConfirmationRecord(base, { ...expected, capabilityId: 'system.other' }, now).errorCode === 'CONFIRMATION_CAPABILITY_MISMATCH');
check('confirmation is bound to input hash', evaluateConfirmationRecord(base, { ...expected, inputHash: hashCapabilityInput(inputChanged) }, now).errorCode === 'CONFIRMATION_INPUT_MISMATCH');
check('expired confirmation is rejected', evaluateConfirmationRecord({ ...base, expiresAtMs: now - 1 }, expected, now).errorCode === 'CONFIRMATION_EXPIRED');
check('consumed confirmation replay is rejected', evaluateConfirmationRecord({ ...base, consumedAt: new Date(now).toISOString() }, expected, now).errorCode === 'CONFIRMATION_REPLAY');

const syntheticGoogleApiKey = `AIza${'A'.repeat(30)}`;

const redacted = sanitizeAuditValue({
  apiKey: syntheticGoogleApiKey,
  nested: {
    authorization: 'Bearer super-secret-token',
    password: 'p@ssw0rd',
    safe: 'visible',
  },
  cookie: 'session=abc',
  bearerValue: 'Bearer abc.def.ghi',
});
check('audit redaction removes API key fields', redacted.apiKey === '[redacted]');
check('audit redaction removes nested authorization/password fields', redacted.nested.authorization === '[redacted]' && redacted.nested.password === '[redacted]');
check('audit redaction preserves safe fields', redacted.nested.safe === 'visible');
check('audit redaction removes cookie fields', redacted.cookie === '[redacted]');
check('audit redaction removes bearer-like values', redacted.bearerValue === '[redacted]');
check('audit redaction summarizes binary payloads', String(sanitizeAuditValue(Buffer.from('secret-bytes'))).startsWith('[binary:'));
check('audit redaction caps long strings', String(sanitizeAuditValue('x'.repeat(700))).length <= 501);
check('audit redaction removes inline bearer tokens', String(sanitizeAuditValue('header Authorization: Bearer abc.def.ghi more')).includes('[redacted]'));
check('audit redaction removes inline API keys', !String(sanitizeAuditValue(`provider failed with ${syntheticGoogleApiKey}`)).includes(syntheticGoogleApiKey));
check('audit redaction removes JSON-formatted secret fields in strings', !String(sanitizeAuditValue('error {\"apiKey\":\"SECRET123\",\"password\":\"hunter2\"}')).includes('SECRET123') && !String(sanitizeAuditValue('error {\"apiKey\":\"SECRET123\",\"password\":\"hunter2\"}')).includes('hunter2'));

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} behavior: ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`Behavior: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
