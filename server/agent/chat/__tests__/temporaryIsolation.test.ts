import { describe, expect, it } from 'vitest';
import { InMemorySessionService } from '@google/adk';

describe('temporary ADK session durability boundary', () => {
  it('is process-local and isolated by user/session identity', async () => {
    const service = new InMemorySessionService();
    await service.createSession({ appName:'root_agent', userId:'owner', sessionId:'temp-a' });
    expect(await service.getSession({ appName:'root_agent', userId:'owner', sessionId:'temp-a' })).toBeTruthy();
    expect(await service.getSession({ appName:'root_agent', userId:'other', sessionId:'temp-a' })).toBeFalsy();
    const freshProcessService = new InMemorySessionService();
    expect(await freshProcessService.getSession({ appName:'root_agent', userId:'owner', sessionId:'temp-a' })).toBeFalsy();
  });
});
