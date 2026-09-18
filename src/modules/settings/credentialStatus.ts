export type CredentialUiStatus =
  | 'untested'
  | 'testing'
  | 'active'
  | 'disabled'
  | 'invalid'
  | 'error'
  | 'quota_exceeded';

export function normalizeCredentialStatus(value: unknown): CredentialUiStatus {
  if (value === 'active' || value === 'disabled' || value === 'invalid') {
    return value;
  }
  return 'error';
}
