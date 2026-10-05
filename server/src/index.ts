import express from 'express';
import { config } from './config.js';
import { intentRouter } from './routes/parse-intent.js';
import { rateLimit } from './rate-limit.js';

const app = express();

// In production we sit behind Apache/Nginx, which terminates TLS and forwards
// X-Forwarded-* headers. Trust the first hop for correct req.ip / req.protocol.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// No CORS headers: the SPA is same-origin in production (the reverse proxy)
// and in dev (Vite's proxy). Allowing any origin would let other sites spend
// the Gemini quota from their visitors' browsers.

// Liveness probe — useful for systemd / pm2 / a load balancer.
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/api', rateLimit(config.rateLimitPerMinute), intentRouter);

// JSON 404 so a misrouted request from Apache doesn't return HTML.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[intent-server] listening on ${config.host}:${config.port} ` +
      `(env=${config.nodeEnv}, models=${config.geminiModels.join(",")})`,
  );
});

// Graceful shutdown — pm2 sends SIGINT, systemd sends SIGTERM. Drain in-flight
// requests before exiting so we don't bork a fetch the SPA is mid-await on.
function shutdown(signal: string): void {
  console.log(`[intent-server] received ${signal}, draining...`);
  server.close((err) => {
    if (err) {
      console.error('[intent-server] error during shutdown:', err);
      process.exit(1);
    }
    process.exit(0);
  });
  // Hard kill after 10s if drain stalls.
  setTimeout(() => {
    console.warn('[intent-server] drain timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
