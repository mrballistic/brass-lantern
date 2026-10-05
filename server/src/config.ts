// Centralized env-var loading. Throws at module init if anything required is missing
// so the process refuses to start in a broken state.

function require_env(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `Set it in the server's environment (production) or server/.env (local dev).`,
    );
  }
  return v;
}

function optional_env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : fallback;
}

// Measured 2026-10-03 through this server: 3.5-flash-lite answered 7/7 test
// commands correctly in ~0.7s; 3.6-flash ~0.9s but occasionally 429s or runs
// past the deadline; 3.5-flash took 5–6s even at thinkingLevel minimal, so it
// can't fit the 5s budget and is deliberately left out.
const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

function model_list(): string[] {
  const raw = optional_env('GEMINI_MODELS', optional_env('GEMINI_MODEL', ''));
  const models = raw.split(',').map((m) => m.trim()).filter(Boolean);
  return models.length > 0 ? models : DEFAULT_MODELS;
}

export const config = {
  geminiKey: require_env('GEMINI_KEY'),
  port: Number.parseInt(optional_env('PORT', '3001'), 10),
  // Bind to loopback by default — Apache/Nginx in front handles the public port.
  host: optional_env('HOST', '127.0.0.1'),
  nodeEnv: optional_env('NODE_ENV', 'development'),
  // Models tried in order, sharing one deadline. A retired model answers 404,
  // which just moves on to the next, so edit this list as Google retires and
  // adds models. GEMINI_MODELS is comma-separated; GEMINI_MODEL is the
  // single-model shorthand older env files use.
  geminiModels: model_list(),
  // Hard ceiling on LLM call latency, across every model tried.
  llmTimeoutMs: 5_000,
  // Cap on each attempt before the last. 3.5-flash-lite usually answers in
  // under a second but occasionally stalls past 4s; 2.5s leaves the fallback
  // (~1s typical) room inside the overall deadline.
  llmAttemptMs: 2_500,
  // Per-client request cap for /api/parse-intent, per worker process.
  rateLimitPerMinute: Number.parseInt(optional_env('RATE_LIMIT_PER_MINUTE', '30'), 10),
} as const;
