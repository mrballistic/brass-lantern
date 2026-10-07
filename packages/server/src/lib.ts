// Package entry: the intent parser as a plain function. Reads no environment
// variables; the caller passes the Gemini key (and anything else) in.
import { parseIntent as parse, type IntentContext, type ParsedAction } from './llm.js';

export type { IntentContext, ParsedAction } from './llm.js';
export { ACTION_VOCAB, THEME_SLUGS } from './llm.js';

export interface ParseIntentOptions {
  /** Gemini API key. Sent only in the x-goog-api-key header. An empty value throws. */
  apiKey: string;
  /** Models tried in order within one deadline. Defaults to the measured-good chain. */
  models?: string[];
  /** Overall deadline across every model tried, in ms. Default 5000. */
  timeoutMs?: number;
  /** Fetch implementation, for tests or custom runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Map loose player input onto the engine's verbs. The model only classifies;
 * the reply is sanitized to known verbs plus identifiers. Resolves to
 * `{ action: 'unknown' }` on any model failure and rejects only for a missing key.
 */
export function parseIntent(
  input: string,
  context: IntentContext,
  options: ParseIntentOptions,
): Promise<ParsedAction> {
  return parse(input, context, {
    apiKey: options.apiKey,
    models: options.models,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetch,
  });
}
