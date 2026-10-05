// Shared test bootstrap — set required env vars before any module reads them.
// Imported by every route test BEFORE the supertest app/import.
process.env.GEMINI_KEY ??= 'test-gemini-key';
process.env.PORT ??= '0';
process.env.NODE_ENV ??= 'test';
process.env.RATE_LIMIT_PER_MINUTE ??= '1000';
process.env.GEMINI_MODELS ??= 'test-primary,test-secondary,test-tertiary';
