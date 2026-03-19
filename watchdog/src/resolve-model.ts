/**
 * Resolve the most recent Claude Haiku model by querying the Anthropic models API.
 *
 * At startup watchdog fetches GET /v1/models, filters for haiku, and uses the
 * first result (newest first). Falls back to the hardcoded default if the API
 * call fails or ANTHROPIC_API_MODEL is already set explicitly.
 */
import { logger } from './logger.js';
import { getApiKey, getUpstreamBaseUrl } from './anthropic-config.js';

const DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5-20251001';

interface AnthropicModel {
  id: string;
  type: string;
  display_name: string;
  created_at: string;
}

export async function resolveLatestHaikuModel(): Promise<string> {
  // If already set explicitly, honour it
  const explicit = process.env.ANTHROPIC_API_MODEL;
  if (explicit) {
    logger.info({ model: explicit }, 'Using configured ANTHROPIC_API_MODEL');
    return explicit;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('No ANTHROPIC_API_KEY, using default Haiku model');
    return DEFAULT_HAIKU_MODEL;
  }

  const baseUrl = getUpstreamBaseUrl().replace(/\/$/, '');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      logger.warn(
        { status: res.status, body: body.slice(0, 200) },
        'Models API error, using default Haiku model',
      );
      return DEFAULT_HAIKU_MODEL;
    }

    const data = (await res.json()) as { data: AnthropicModel[] };
    const haikus = data.data
      .filter((m) => m.id.toLowerCase().includes('haiku'))
      // Sort newest first by created_at
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    if (haikus.length === 0) {
      logger.warn(
        { available: data.data.map((m) => m.id) },
        'No Haiku models found, using default',
      );
      return DEFAULT_HAIKU_MODEL;
    }

    const model = haikus[0].id;
    logger.info(
      { model, haikusFound: haikus.map((m) => m.id) },
      'Resolved latest Haiku model',
    );
    return model;
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch models, using default Haiku model');
    return DEFAULT_HAIKU_MODEL;
  }
}
