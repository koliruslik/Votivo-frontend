import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthenticator } from './auth.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
export function createApp(options = {}) {
  const origin = new URL(options.origin ?? process.env['PUBLIC_ORIGIN'] ?? 'http://localhost:4200')
    .origin;
  const issuer = process.env['KEYCLOAK_ISSUER'] ?? 'http://localhost:18080/realms/votivo';
  const authenticate =
    options.authenticate ??
    createAuthenticator({
      issuer,
      audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'poll-service',
      jwksUrl: process.env['KEYCLOAK_JWKS_URL'] ?? `${issuer}/protocol/openid-connect/certs`,
    });
  const targets = options.targets ?? {
    poll: process.env['POLL_URL'] ?? 'http://localhost:18082',
    vote: process.env['VOTE_URL'] ?? 'http://localhost:18083',
    result: process.env['RESULT_URL'] ?? 'http://localhost:18084',
  };
  const root = resolve(options.root ?? 'dist/votivo-frontend/browser');
  const send = (res, status, message) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message }));
  };
  const upstream = (target, path, init = {}) =>
    fetch(new URL(path, target), {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url, origin);
      if (url.origin !== origin || req.url.includes('\\') || /%2f|%5c/i.test(req.url))
        return send(res, 400, 'Invalid path');
      if (url.pathname === '/silent-check-sso.html') res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      if (url.pathname === '/health') return send(res, 200, 'ok');
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed');
        let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
        if (path !== root && !path.startsWith(root + sep)) return send(res, 404, 'Not found');
        try {
          if (!(await stat(path)).isFile()) path = resolve(root, 'index.html');
        } catch {
          if (extname(path)) return send(res, 404, 'Not found');
          path = resolve(root, 'index.html');
        }
        const content = await readFile(path);
        res.writeHead(200, {
          'Content-Type': types[extname(path)] ?? 'application/octet-stream',
          'Cache-Control': /[-.][a-zA-Z0-9_-]{8,}\.js$/.test(path)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      res.setHeader('Cache-Control', 'no-store');
      const path = url.pathname;
      const id = '[0-9a-fA-F-]{36}';
      const vote = new RegExp(`^/api/v1/polls/(${id})/vote$`).exec(path);
      const result = new RegExp(`^/api/v1/polls/(${id})/results$`).exec(path);
      const pollRoute =
        /^\/api\/v1\/polls(?:\/(?:mine|by-link\/[0-9a-fA-F-]{36}|[0-9a-fA-F-]{36}(?:\/(?:publish|close|archive))?))?$/.test(
          path,
        );
      const adminRoute = /^\/api\/v1\/admin\/polls(?:\/[0-9a-fA-F-]{36}\/block)?$/.test(path);
      if (!vote && !result && !pollRoute && !adminRoute) return send(res, 404, 'Not found');
      if (
        !['GET', 'POST', 'PUT', 'DELETE'].includes(req.method) ||
        (result && req.method !== 'GET')
      )
        return send(res, 405, 'Method not allowed');
      if (req.headers.origin && req.headers.origin !== origin)
        return send(res, 403, 'Origin rejected');
      let identity;
      if (req.headers.authorization) {
        try {
          identity = await authenticate(
            req.headers.authorization,
            req.headers.dpop,
            req.method,
            new URL(req.url, origin).href,
          );
        } catch {
          res.setHeader('WWW-Authenticate', 'DPoP, Bearer');
          return send(res, 401, 'Invalid or expired session');
        }
      }
      if ((vote || adminRoute || path.endsWith('/mine') || req.method !== 'GET') && !identity)
        return send(res, 401, 'Sign in required');
      if (adminRoute && !identity?.admin) return send(res, 403, 'Administrator required');
      const headers = { Accept: 'application/json' };
      if (identity) headers['Authorization'] = `Bearer ${identity.token}`;
      if (vote || result) {
        const pollId = (vote || result)[1];
        const link = url.searchParams.get('shareToken');
        let access = await upstream(targets.poll, `/api/v1/polls/${pollId}`, { headers });
        if (!access.ok && link && /^[0-9a-fA-F-]{36}$/.test(link)) {
          access = await upstream(targets.poll, `/api/v1/polls/by-link/${link}`, { headers });
          if (access.ok && (await access.clone().json()).id !== pollId)
            return send(res, 404, 'Poll not available');
        }
        if (!access.ok)
          return send(res, access.status >= 500 ? 503 : access.status, 'Poll not available');
        const metadata = await access.json();
        if (metadata.blocked && !identity?.admin) return send(res, 404, 'Poll not available');
      }
      if (vote) headers['X-User-ID'] = identity.subject;
      let body;
      if (req.method === 'POST' || req.method === 'PUT') {
        if (
          req.headers['content-type']?.split(';')[0] !== 'application/json' &&
          req.headers['content-length'] !== '0' &&
          !path.endsWith('/publish') &&
          !path.endsWith('/close') &&
          !path.endsWith('/archive') &&
          !path.endsWith('/block')
        )
          return send(res, 415, 'JSON required');
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) return send(res, 413, 'Body too large');
          chunks.push(chunk);
        }
        if (size) {
          body = Buffer.concat(chunks);
          headers['Content-Type'] = 'application/json';
        }
      }
      url.searchParams.delete('shareToken');
      const response = await upstream(
        targets[vote ? 'vote' : result ? 'result' : 'poll'],
        url.pathname + url.search,
        { method: req.method, headers, body },
      );
      if (response.status >= 300 && response.status < 400)
        return send(res, 502, 'Unexpected service redirect');
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) send(res, 502, 'Service unavailable');
      else res.end();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4300);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Votivo server: http://localhost:${port}`));
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
