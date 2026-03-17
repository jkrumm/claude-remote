/**
 * Proactive OAuth token refresh for Claude credentials.
 *
 * The Claude OAuth access token expires after 8 hours. Without an active
 * claude CLI session to trigger auto-refresh, the token goes stale and all
 * agent containers fail with 401. This module refreshes the token before
 * expiry so nanoclaw keeps working unattended.
 *
 * Refresh is attempted every 6 hours. If the token still has >2 hours left
 * we skip the refresh to avoid unnecessary rotations.
 */
import fs from 'fs';

import { logger } from './logger.js';

const OAUTH_TOKEN_ENDPOINT = 'https://platform.claude.com/v1/oauth/token';
const CLAUDE_CODE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

/** Minimum remaining lifetime before we proactively refresh (2 hours). */
const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/** How often to check and potentially refresh (6 hours). */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

function readCredentials(filePath: string): ClaudeCredentials | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ClaudeCredentials;
  } catch {
    return null;
  }
}

function writeCredentials(filePath: string, data: ClaudeCredentials): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function refreshTokenIfNeeded(
  credsFile: string,
): Promise<'refreshed' | 'skipped' | 'error'> {
  const creds = readCredentials(credsFile);
  if (!creds?.claudeAiOauth?.refreshToken) {
    logger.warn({ credsFile }, 'Token refresh: no refresh token found');
    return 'error';
  }

  const { accessToken, refreshToken, expiresAt } = creds.claudeAiOauth;
  const remainingMs = (expiresAt ?? 0) - Date.now();

  if (remainingMs > REFRESH_THRESHOLD_MS) {
    logger.debug(
      { remainingHours: Math.round(remainingMs / 3_600_000) },
      'Token refresh: skipped, still fresh',
    );
    return 'skipped';
  }

  logger.info(
    {
      remainingHours: Math.max(0, Math.round(remainingMs / 3_600_000)),
      expired: remainingMs <= 0,
    },
    'Token refresh: refreshing OAuth token',
  );

  try {
    const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_CODE_CLIENT_ID,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(
        { status: res.status, body },
        'Token refresh: HTTP error from token endpoint',
      );
      return 'error';
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (data.error || !data.access_token) {
      logger.error({ error: data.error }, 'Token refresh: token endpoint error');
      return 'error';
    }

    const newCreds: ClaudeCredentials = {
      ...creds,
      claudeAiOauth: {
        ...creds.claudeAiOauth,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: Date.now() + (data.expires_in ?? 28800) * 1000,
      },
    };

    writeCredentials(credsFile, newCreds);
    logger.info(
      { expiresInHours: Math.round((data.expires_in ?? 28800) / 3600) },
      'Token refresh: credentials updated',
    );
    return 'refreshed';
  } catch (err) {
    logger.error({ err }, 'Token refresh: unexpected error');
    return 'error';
  }
}

/**
 * Start the background refresh loop.
 * Runs once immediately at startup (catches already-expired tokens),
 * then every 6 hours.
 */
export function startTokenRefreshLoop(): void {
  const credsFile = process.env.CLAUDE_CREDENTIALS_FILE;
  if (!credsFile) {
    logger.debug('Token refresh: CLAUDE_CREDENTIALS_FILE not set, skipping');
    return;
  }

  const run = () =>
    refreshTokenIfNeeded(credsFile).catch((err) =>
      logger.error({ err }, 'Token refresh: unhandled error'),
    );

  // Run immediately at startup
  run();

  // Then on a regular interval
  setInterval(run, CHECK_INTERVAL_MS);
}
