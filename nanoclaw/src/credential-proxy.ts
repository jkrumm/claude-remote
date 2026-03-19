/**
 * Credential proxy for container isolation.
 * Containers connect here instead of directly to the Anthropic API.
 * The proxy injects the real API key so containers never see it.
 *
 * Reads ANTHROPIC_API_KEY and ANTHROPIC_API_URL (or ANTHROPIC_BASE_URL) once
 * at startup — both are stable secrets that don't change while running.
 */
import { createServer, Server } from 'http';
import { request as httpsRequest } from 'https';
import { request as httpRequest, RequestOptions } from 'http';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export function startCredentialProxy(
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const secrets = readEnvFile([
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_API_URL',
    'ANTHROPIC_BASE_URL',
  ]);

  const apiKey = secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Promise.reject(
      new Error('ANTHROPIC_API_KEY is required — set it in Doppler or .env'),
    );
  }

  const upstreamUrl = new URL(
    secrets.ANTHROPIC_API_URL ||
      process.env.ANTHROPIC_API_URL ||
      secrets.ANTHROPIC_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      'https://api.anthropic.com',
  );

  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers: Record<string, string | number | string[] | undefined> =
          {
            ...(req.headers as Record<string, string>),
            host: upstreamUrl.host,
            'x-api-key': apiKey,
            'content-length': body.length,
          };

        // Strip hop-by-hop headers that must not be forwarded by proxies
        delete headers['connection'];
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];
        // Strip any auth header from container — x-api-key above is the auth
        delete headers['authorization'];

        const upstream = makeRequest(
          {
            hostname: upstreamUrl.hostname,
            port: upstreamUrl.port || (isHttps ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
          } as RequestOptions,
          (upRes) => {
            res.writeHead(upRes.statusCode!, upRes.headers);
            upRes.pipe(res);
          },
        );

        upstream.on('error', (err) => {
          logger.error(
            { err, url: req.url },
            'Credential proxy upstream error',
          );
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
          }
        });

        upstream.write(body);
        upstream.end();
      });
    });

    server.listen(port, host, () => {
      logger.info(
        { port, host, upstream: upstreamUrl.host },
        'Credential proxy started',
      );
      resolve(server);
    });

    server.on('error', reject);
  });
}

/** Return the configured upstream base URL (for model resolution etc). */
export function getUpstreamBaseUrl(): string {
  const secrets = readEnvFile(['ANTHROPIC_API_URL', 'ANTHROPIC_BASE_URL']);
  return (
    secrets.ANTHROPIC_API_URL ||
    process.env.ANTHROPIC_API_URL ||
    secrets.ANTHROPIC_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.anthropic.com'
  );
}

/** Return the configured API key. */
export function getApiKey(): string | undefined {
  const secrets = readEnvFile(['ANTHROPIC_API_KEY']);
  return secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}
