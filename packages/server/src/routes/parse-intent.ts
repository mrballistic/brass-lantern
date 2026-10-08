import { Router } from 'express';
import { IDENTIFIER_RE, parseIntent, requireApiKey, type IntentContext } from '../llm.js';

function isIntentContext(value: unknown): value is IntentContext {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.roomName === 'string' &&
    Array.isArray(c.exits) &&
    Array.isArray(c.items) &&
    Array.isArray(c.npcs) &&
    Array.isArray(c.inventory)
  );
}

// Real commands are a few words. Anything longer is either a paste or an
// attempt to spend tokens, and the regex parser has already had its chance.
const MAX_INPUT_CHARS = 200;
const MAX_CONTEXT_ENTRIES = 50;

function contextIsBounded(c: IntentContext): boolean {
  const lists = [c.exits, c.items, c.npcs, c.inventory];
  const verbs = c.verbs;
  if (verbs !== undefined) {
    if (!Array.isArray(verbs) || verbs.length > MAX_CONTEXT_ENTRIES) return false;
    if (!verbs.every((v) => typeof v === 'string' && IDENTIFIER_RE.test(v))) return false;
  }
  return (
    c.roomName.length <= 100 &&
    lists.every(
      (l) =>
        l.length <= MAX_CONTEXT_ENTRIES &&
        l.every((e) => typeof e === 'string' && e.length <= 100),
    )
  );
}

export interface IntentRouterOptions {
  apiKey: string;
  models?: readonly string[];
  timeoutMs?: number;
}

/** The POST /parse-intent handler, no rate limit. `intentRoute` (express.ts) adds that. */
export function createIntentRouter(options: IntentRouterOptions): Router {
  // Checked here, so a missing key fails at construction, not on the first request.
  const apiKey = requireApiKey(options.apiKey);
  // parseIntent applies the defaults (models, deadline, per-attempt cap).
  const { models, timeoutMs } = options;
  const router = Router();

  /**
   * POST /api/parse-intent
   * Body: { input: string, context: IntentContext }
   * Returns 200 { action, target? } or 500 { error, fallback }.
   *
   * No auth. Abuse is bounded by the per-IP rate limit in intentRoute, the input
   * caps above, and Gemini's own quota.
   */
  router.post('/parse-intent', async (req, res) => {
    const body = req.body as Partial<{ input: unknown; context: unknown }> | undefined;
    if (!body || typeof body.input !== 'string' || body.input.trim().length === 0) {
      res.status(400).json({ error: 'Missing required field: input' });
      return;
    }
    if (body.input.length > MAX_INPUT_CHARS) {
      res.status(400).json({ error: 'Input too long', fallback: { action: 'unknown' } });
      return;
    }
    if (!isIntentContext(body.context) || !contextIsBounded(body.context)) {
      res.status(400).json({ error: 'Missing required field: context' });
      return;
    }
    try {
      const parsed = await parseIntent(body.input, body.context, { apiKey, models, timeoutMs });
      res.status(200).json(parsed);
    } catch (err) {
      console.error(
        'parse-intent route failed:',
        err instanceof Error ? err.stack ?? err.message : err,
      );
      res.status(500).json({
        error: 'Intent parsing failed',
        fallback: { action: 'unknown' },
      });
    }
  });

  return router;
}
