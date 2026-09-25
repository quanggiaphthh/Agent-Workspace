import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../server/lib/firebaseAdmin', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    adminAuth: {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'owner-test',
        email: 'owner@test.local',
        name: 'Owner',
      }),
    },
  };
});

import { app } from '../../server';

describe('API fallback contract', () => {
  it('returns JSON 404 for an authenticated unknown API route', async () => {
    const response = await request(app)
      .get('/api/does-not-exist')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: 'API route not found.',
      code: 'API_ROUTE_NOT_FOUND',
    });
  });
});
