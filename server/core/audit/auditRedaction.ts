const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 4;

const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|authorization|auth[_-]?token|bearer|token|id[_-]?token|access[_-]?token|refresh[_-]?token|credential|secret|password|passwd|cookie|set-cookie|firebase[_-]?(?:id)?[_-]?token)/i;
const SECRET_VALUE_PATTERNS = [
  /^\s*bearer\s+\S+/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  /^AIza[0-9A-Za-z_-]{20,}$/,
];

export function redactAuditString(value: string): string {
  if (SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value))) return '[redacted]';
  const redacted = value
    .replace(/([\"'])(api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|credential|secret|password|passwd|cookie)\1\s*:\s*([\"'])[^\"']*\3/gi, '$1$2$1:$3[redacted]$3')
    .replace(/bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/(api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|credential|secret|password|passwd|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  return redacted.length > MAX_STRING_LENGTH ? `${redacted.slice(0, MAX_STRING_LENGTH)}…` : redacted;
}

export function sanitizeAuditValue(value: unknown, depth = 0, keyHint = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(keyHint)) return '[redacted]';
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string') return redactAuditString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (Buffer.isBuffer(value)) return `[binary:${value.length} bytes]`;
  if (value instanceof Uint8Array) return `[binary:${value.byteLength} bytes]`;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => sanitizeAuditValue(item, depth + 1));
  }

  if (typeof value !== 'object') return redactAuditString(String(value));

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  for (const [key, item] of entries) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitizeAuditValue(item, depth + 1, key);
  }
  return result;
}

export function sanitizeAuditStringArray(values: string[] | undefined, maxItems = 100): string[] | undefined {
  if (!values) return undefined;
  return values.slice(0, maxItems).map(value => redactAuditString(String(value)));
}
