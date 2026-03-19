/**
 * Anthropic API configuration helpers.
 * Credentials are injected directly as env vars — no proxy needed.
 */

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function getUpstreamBaseUrl(): string {
  return (
    process.env.ANTHROPIC_API_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.anthropic.com'
  );
}
