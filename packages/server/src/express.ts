// Express adapter: POST /parse-intent behind a per-client rate limit. Mount it
// where you like (the app mounts it at /api). Reads no environment variables.
import { Router } from 'express';
import { createIntentRouter } from './routes/parse-intent.js';
import { rateLimit } from './rate-limit.js';

export interface IntentRouteOptions {
  /** Gemini API key. An empty value throws here, at construction. */
  apiKey: string;
  /** Models tried in order within one deadline. Unset or empty: the defaults. */
  models?: string[];
  timeoutMs?: number;
  /** Per-client requests per minute (per process). A positive finite number, else this throws at construction. Default 30. */
  rateLimitPerMinute?: number;
}

/**
 * The caller owns `express.json()` (the route needs a parsed body) and
 * `trust proxy`; the route sets no CORS headers.
 */
export function intentRoute(options: IntentRouteOptions): Router {
  const perMinute = options.rateLimitPerMinute ?? 30;
  if (typeof perMinute !== 'number' || !Number.isFinite(perMinute) || perMinute <= 0) {
    throw new Error(`rateLimitPerMinute must be a positive finite number (got ${String(perMinute)}).`);
  }
  const handler = createIntentRouter(options);
  const router = Router();
  router.use(rateLimit(perMinute), handler);
  return router;
}
