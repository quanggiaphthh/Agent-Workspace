
/**
 * Utility to sanitize objects for Firestore persistence.
 * 1. Recursively removes properties with 'undefined' values from plain objects.
 * 2. Filters out 'undefined' elements from arrays while preserving order.
 * 3. Preserves special object instances (Date, Timestamp, Uint8Array, etc.) by only recursing plain objects.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeForFirestore(value: unknown): unknown {
  // Handle Arrays
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item));
  }

  // Handle Plain Objects
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      output[key] = sanitizeForFirestore(item);
    }

    return output;
  }

  // Return primitive values or special object instances (Date, Timestamp, etc.) as is
  return value;
}
