import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

describe('ws http upgrade route', () => {
  it('returns 426 when websocket upgrade headers are missing', async () => {
    const { app } = createTestApp();
    const response = await app.request('/v1/ws');
    expect(response.status).toBe(426);
    expect(response.headers.get('Upgrade')).toBe('websocket');
  });
});
