import { describe, expect, it } from 'vitest';

import { APP_ID, APP_NAME, ROUTER_HOST } from '../src/app-info.js';

describe('app-info', () => {
  it('names the app', () => {
    expect(APP_NAME).toBe('ck-connect-check');
  });

  it('exposes a reverse-DNS bundle id', () => {
    expect(APP_ID).toMatch(/^[a-z]+(\.[a-z0-9-]+)+$/);
  });

  it('defaults to the HiLink router address', () => {
    expect(ROUTER_HOST).toBe('192.168.8.1');
  });
});
