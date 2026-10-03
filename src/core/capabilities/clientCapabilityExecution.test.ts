import { beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMocks = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock('../../lib/authFetch', () => ({ authFetch: gatewayMocks.authFetch }));
vi.mock('../context/contextStore', () => ({
  useContextStore: { getState: () => ({ user: { id: 'owner-1' }, getAppContext: () => ({ availableCapabilities: [] }) }) },
}));
vi.mock('../events/eventBus', () => ({ eventBus: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../navigation/navigationService', () => ({ navigationService: { openModule: vi.fn(), openEntity: vi.fn() } }));

import { clientCapabilityRegistry } from './capabilityRegistry';

describe('client capability confirmation gateway options', () => {
  beforeEach(() => gatewayMocks.authFetch.mockReset());

  it('keeps the confirmation challenge bound to the same idempotent mutation request', async () => {
    const mutationInput = { fileId: 'file-1', paragraphId: 'p1', desiredAfter: 'RIGHT' };
    const idempotencyKey = '9e2ff302-4b58-4fc2-bc20-d2893f590dad';
    const confirmationId = 'confirm-001';
    gatewayMocks.authFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        requiresConfirmation: true,
        risk: 'high',
        error: 'User confirmation is required.',
        confirmationId,
        confirmationExpiresAt: '2026-10-03T01:00:00.000Z',
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { outputFile: { fileId: 'file-2' } }, confirmationId }), { status: 200 }));

    const challenge = await clientCapabilityRegistry.execute('document.applyAlignment', mutationInput, { idempotencyKey });
    expect(challenge).toMatchObject({ success: false, requiresConfirmation: true, confirmationId, confirmationExpiresAt: '2026-10-03T01:00:00.000Z' });

    const applied = await clientCapabilityRegistry.execute('document.applyAlignment', mutationInput, { idempotencyKey, confirmationId });
    expect(applied).toMatchObject({ success: true, confirmationId, result: { outputFile: { fileId: 'file-2' } } });
    expect(gatewayMocks.authFetch).toHaveBeenCalledTimes(2);

    for (const [, init] of gatewayMocks.authFetch.mock.calls) {
      expect(init.method).toBe('POST');
      expect(init.headers.get('Idempotency-Key')).toBe(idempotencyKey);
      const body = JSON.parse(init.body);
      expect(body.id).toBe('document.applyAlignment');
      expect(body.input).toEqual(mutationInput);
      expect(body.confirmed).toBeUndefined();
    }
    expect(JSON.parse(gatewayMocks.authFetch.mock.calls[0][1].body).confirmationId).toBeUndefined();
    expect(JSON.parse(gatewayMocks.authFetch.mock.calls[1][1].body).confirmationId).toBe(confirmationId);
  });

  it('preserves the existing boolean confirmation parameter for local capabilities', async () => {
    const execute = vi.fn(async () => ({ accepted: true }));
    clientCapabilityRegistry.register({
      id: 'test.local.confirmation',
      moduleId: 'test',
      description: 'Test capability.',
      inputSchema: null as any,
      risk: 'high',
      permissions: [],
      confirmationPolicy: 'required',
      execute,
    });

    await expect(clientCapabilityRegistry.execute('test.local.confirmation', {}, false))
      .resolves.toMatchObject({ success: false, requiresConfirmation: true });
    await expect(clientCapabilityRegistry.execute('test.local.confirmation', {}, true))
      .resolves.toMatchObject({ success: true, result: { accepted: true } });
    expect(execute).toHaveBeenCalledOnce();
  });
});
