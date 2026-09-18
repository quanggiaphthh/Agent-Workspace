
import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { sanitizeForFirestore } from '../firestoreSerialization';

describe('Firestore Serialization (QA Hygiene Suite)', () => {
  // 1. Plain object
  it('1. Plain object: should omit undefined and preserve other primitives (null, false, 0, "")', () => {
    const plainObj = {
      u: undefined,
      n: null,
      b: false,
      z: 0,
      s: "",
      valid: "ok"
    };
    const result = sanitizeForFirestore(plainObj) as any;
    
    expect(result).not.toHaveProperty('u');
    expect(result.n).toBeNull();
    expect(result.b).toBe(false);
    expect(result.z).toBe(0);
    expect(result.s).toBe("");
    expect(result.valid).toBe("ok");
  });

  // 2. Nested object
  it('2. Nested object: should omit nested undefined and preserve nested valid values', () => {
    const nestedObj = {
      level1: {
        level2: {
          u: undefined,
          v: "nested-ok"
        }
      }
    };
    const result = sanitizeForFirestore(nestedObj) as any;
    
    expect(result.level1.level2.v).toBe("nested-ok");
    expect(result.level1.level2).not.toHaveProperty('u');
  });

  // 3. Array
  it('3. Array: should filter out undefined and sanitize nested objects while preserving order', () => {
    const input = [1, undefined, 2, { a: undefined, b: 3 }];
    const result = sanitizeForFirestore(input) as any[];
    
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2].b).toBe(3);
    expect(result[2]).not.toHaveProperty('a');
  });

  // 4. Date
  it('4. Date: should preserve Date instances without flattening to plain object', () => {
    const now = new Date();
    const result = sanitizeForFirestore(now);
    
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(now.getTime());
    // Ensure it's not a plain object {}
    expect(Object.getPrototypeOf(result)).toBe(Date.prototype);
  });

  // 5. Custom class instance
  it('5. Custom class instance: should preserve arbitrary class instances', () => {
    class MyEntity {
      constructor(public id: string) {}
    }
    const instance = new MyEntity('ent_123');
    const result = sanitizeForFirestore(instance);
    
    expect(result).toBeInstanceOf(MyEntity);
    expect((result as MyEntity).id).toBe('ent_123');
  });

  // 6. Uint8Array
  it('6. Uint8Array: should preserve Uint8Array instances', () => {
    const data = new Uint8Array([255, 0, 127]);
    const result = sanitizeForFirestore(data);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(data);
  });

  // 7. Buffer (if available in environment)
  it('7. Buffer: should preserve Buffer instances if present', () => {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from('hello');
      const result = sanitizeForFirestore(buf);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as any).toString()).toBe('hello');
    }
  });

  // 8. Firestore Timestamp (Real firebase-admin Timestamp)
  it('8. Firestore Timestamp: should preserve real firebase-admin/firestore Timestamp instances without flattening', () => {
    const ts = Timestamp.fromMillis(Date.now());
    const input = {
      timestamp: ts
    };
    const output = sanitizeForFirestore(input) as Record<string, unknown>;
    
    expect(output.timestamp).toBe(ts);
    expect(output.timestamp).toBeInstanceOf(Timestamp);
    expect(Object.getPrototypeOf(output.timestamp)).toBe(Timestamp.prototype);

    // Direct standalone preservation test
    const directOutput = sanitizeForFirestore(ts);
    expect(directOutput).toBe(ts);
    expect(directOutput).toBeInstanceOf(Timestamp);
  });

  // 9. Non-mutation
  it('9. Non-mutation: should strictly avoid mutating input objects/arrays', () => {
    const inner = { u: undefined };
    const obj = { u: undefined, inner };
    const arr = [undefined, inner];
    
    sanitizeForFirestore(obj);
    sanitizeForFirestore(arr);
    
    expect(obj).toHaveProperty('u');
    expect(inner).toHaveProperty('u');
    expect(arr).toHaveLength(2);
    expect(arr[0]).toBeUndefined();
  });

  // 10. ADK-style event (Omit)
  it('10. ADK-style event: should omit undefined customMetadata', () => {
    const event = {
      role: 'user',
      customMetadata: undefined
    };
    const result = sanitizeForFirestore(event) as any;
    expect(result).not.toHaveProperty('customMetadata');
  });

  // 11. ADK-style event (Preserve)
  it('11. ADK-style event: should preserve valid customMetadata', () => {
    const eventWithMeta = {
      role: 'user',
      customMetadata: { source: 'test-adk' }
    };
    const result = sanitizeForFirestore(eventWithMeta) as any;
    expect(result.customMetadata.source).toBe('test-adk');
  });

  // 12. Custom class instance with methods (Custom class preservation)
  it('12. Custom class with methods: should preserve class instances with custom methods and prototype', () => {
    class CustomTimestampLike {
      constructor(public seconds: number, public nanoseconds: number) {}
      toDate() { return new Date(this.seconds * 1000); }
    }
    const instance = new CustomTimestampLike(1726610000, 0);
    const result = sanitizeForFirestore(instance);
    
    expect(result).toBeInstanceOf(CustomTimestampLike);
    expect((result as CustomTimestampLike).seconds).toBe(1726610000);
    expect((result as CustomTimestampLike).toDate().getTime()).toBe(1726610000 * 1000);
  });
});


