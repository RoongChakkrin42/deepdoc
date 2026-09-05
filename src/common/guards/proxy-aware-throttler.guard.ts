import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Reads one header value whether Express hands it over as a string or a list. */
const first = (value: string | string[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;

/**
 * Rate limits by the real caller rather than by whichever proxy last touched
 * the request.
 *
 * `ThrottlerGuard` keys on `req.ip`, which Express derives from
 * `X-Forwarded-For` using the `trust proxy` hop count. That count belongs to
 * the deployment, not to the application: one hop behind Traefik in Kubernetes,
 * two behind Render, where Cloudflare terminates first and Render's own router
 * forwards after it. Guessing it wrong does not fail loudly. It buckets
 * requests under an address that rotates, so every caller quietly gets a fresh
 * allowance — measured on Render, seven requests to an endpoint capped at five
 * per hour all went through, while the same build locally returned 429 on the
 * sixth.
 *
 * `CF-Connecting-IP` avoids the counting problem entirely: Cloudflare fills it
 * from the socket it terminated and overwrites anything the caller sent, so
 * where the header exists it is both accurate and unforgeable. Everywhere else
 * this falls back to `req.ip`, which is correct for the single-proxy case
 * Kubernetes runs.
 *
 * This matters more than a tidier limit. `POST /submissions` and
 * `POST /auth/register` are deliberately unauthenticated, with rate limiting
 * named in the README as their only protection — and every submission that
 * gets through is a billed multimodal Gemini call, retried up to
 * `ANALYSIS_MAX_ATTEMPTS` times.
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<
      string,
      string | string[] | undefined
    >;

    const tracker =
      first(headers['cf-connecting-ip']) ??
      first(headers['true-client-ip']) ??
      (typeof req.ip === 'string' ? req.ip : undefined) ??
      'unknown';

    return Promise.resolve(tracker);
  }
}
