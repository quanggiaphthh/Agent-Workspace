import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('REST mutation idempotency contract wiring', () => {
  it('accepts only a bounded explicit Idempotency-Key and passes it to the canonical gateway', () => {
    const source = readFileSync(new URL('../../../../server.ts', import.meta.url), 'utf8');
    expect(source).toContain("req.get('Idempotency-Key')");
    expect(source).toContain("/^[A-Za-z0-9._:-]{8,128}$/");
    expect(source).toMatch(/CapabilityExecutionService\.execute[\s\S]*?idempotencyKey/);
    expect(source).not.toContain('alreadyExecuted');
  });
});
