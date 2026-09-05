import { ProxyAwareThrottlerGuard } from './proxy-aware-throttler.guard';

/**
 * `getTracker` is protected, which is the point — it exists to be overridden.
 * Reaching it through a subclass keeps the test on the contract the base class
 * defines rather than on an export invented for testability.
 */
class Probe extends ProxyAwareThrottlerGuard {
  constructor() {
    super(undefined as never, undefined as never, undefined as never);
  }
  track(req: Record<string, unknown>) {
    return this.getTracker(req);
  }
}

describe('ProxyAwareThrottlerGuard', () => {
  const guard = new Probe();

  it('prefers the address Cloudflare terminated', async () => {
    await expect(
      guard.track({
        headers: {
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '198.51.100.1',
        },
        ip: '10.0.0.1',
      }),
    ).resolves.toBe('203.0.113.9');
  });

  // Cloudflare overwrites CF-Connecting-IP, so a caller cannot use it to claim
  // someone else's allowance — but a caller *can* set X-Forwarded-For, which is
  // why that header is never trusted on its own here.
  it('ignores a forged X-Forwarded-For when Cloudflare has spoken', async () => {
    await expect(
      guard.track({
        headers: {
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        },
        ip: '10.0.0.1',
      }),
    ).resolves.toBe('203.0.113.9');
  });

  it('falls back to req.ip off Cloudflare, which is the Kubernetes case', async () => {
    await expect(
      guard.track({ headers: {}, ip: '198.51.100.7' }),
    ).resolves.toBe('198.51.100.7');
  });

  it('takes the first entry when a header arrives as a list', async () => {
    await expect(
      guard.track({
        headers: { 'cf-connecting-ip': ['203.0.113.9', '203.0.113.10'] },
      }),
    ).resolves.toBe('203.0.113.9');
  });

  // Everything sharing one bucket is the safe direction to fail: it throttles
  // too much rather than not at all.
  it('never returns an empty key', async () => {
    await expect(guard.track({ headers: {} })).resolves.toBe('unknown');
    await expect(guard.track({})).resolves.toBe('unknown');
  });
});
