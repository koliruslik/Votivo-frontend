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
      requireDpop: process.env['REQUIRE_DPOP'] !== 'false',
      audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'poll-service',
      jwksUrl: process.env['KEYCLOAK_JWKS_URL'] ?? `${issuer}/protocol/openid-connect/certs`,
    });
  const targets = options.targets ?? {
    user: process.env['USER_URL'] ?? 'http://localhost:18081',
    poll: process.env['POLL_URL'] ?? 'http://localhost:18082',
    vote: process.env['VOTE_URL'] ?? 'http://localhost:18083',
    result: process.env['RESULT_URL'] ?? 'http://localhost:18084',
  };
  const root = resolve(options.root ?? 'dist/votivo-frontend/browser');
  const authenticateUser =
    options.authenticateUser ??
    options.authenticate ??
    createAuthenticator({
      issuer,
      requireDpop: process.env['REQUIRE_DPOP'] !== 'false',
      audience: 'user-service',
      jwksUrl: process.env['KEYCLOAK_JWKS_URL'] ?? `${issuer}/protocol/openid-connect/certs`,
    });
  const send = (res, status, message) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message }));
  };
  // Poll, Vote and Result trust the identity this gateway forwards, so they only accept calls that carry this secret.
  const internalSecret = options.internalSecret ?? process.env['INTERNAL_AUTH_SECRET'];
  const upstream = (target, path, init = {}) =>
    fetch(new URL(path, target), {
      ...init,
      headers: {
        ...init.headers,
        ...(internalSecret ? { 'X-Internal-Auth': internalSecret } : {}),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
  const checkAccount = options.checkAccount ?? (async identity => {
    if (!internalSecret || !Number.isSafeInteger(identity.issuedAt) || identity.issuedAt <= 0) return 503;
    try {
      const response = await upstream(targets.user ?? process.env['USER_URL'] ?? 'http://localhost:18081',
        `/internal/v1/users/${encodeURIComponent(identity.subject)}/access?issuedAt=${identity.issuedAt}${identity.admin ? '&admin=true' : ''}`);
      if (response.status === 204) return 204;
      return [403, 404].includes(response.status) ? 403 : 503;
    } catch {
      return 503;
    }
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
      const adminUsersRoute = /^\/api\/v1\/admin\/users(?:\/[0-9a-fA-F-]{36}(?:\/status)?)?$/.test(
        path,
      );
      const photoRoute = path === '/api/v1/users/me/photo';
      const userRoute =
        adminUsersRoute ||
        photoRoute ||
        path === '/api/v1/users/me' ||
        path === '/api/v1/users/me/header';
      if (userRoute) {
        if (
          !(
            adminUsersRoute
              ? path.endsWith('/status')
                ? ['PATCH']
                : ['GET']
              : photoRoute
                ? ['GET', 'PUT', 'DELETE']
                : path.endsWith('/header')
                  ? ['GET']
                  : ['GET', 'PATCH', 'DELETE']
          ).includes(req.method)
        )
          return send(res, 405, 'Method not allowed');
        if (req.headers.origin && req.headers.origin !== origin)
          return send(res, 403, 'Origin rejected');
        if (!req.headers.authorization) return send(res, 401, 'Sign in required');
        try {
          const user = await authenticateUser(
            req.headers.authorization,
            req.headers.dpop,
            req.method,
            url.href,
          );
          if (adminUsersRoute && !user.admin) return send(res, 403, 'Administrator required');
          if (
            user.admin &&
            !adminUsersRoute &&
            !(path === '/api/v1/users/me/header' && req.method === 'GET')
          )
            return send(res, 403, 'Administrators can only manage users and polls');
        } catch {
          return send(res, 401, 'Invalid or expired session');
        }
        const headers = {
          Accept: photoRoute
            ? 'image/jpeg, image/png, application/problem+json'
            : 'application/json',
          Authorization: req.headers.authorization,
          'X-Forwarded-Proto': new URL(origin).protocol.slice(0, -1),
          'X-Forwarded-Host': new URL(origin).host,
          ...(req.headers.dpop ? { DPoP: req.headers.dpop } : {}),
        };
        let body;
        if (req.method === 'PATCH' || (photoRoute && req.method === 'PUT')) {
          const contentType = req.headers['content-type'] ?? '';
          const limit = photoRoute ? 6 * 1024 * 1024 : 16384;
          if (
            photoRoute &&
            (!/^multipart\/form-data\s*;/i.test(contentType) || !/boundary=/i.test(contentType))
          )
            return send(res, 415, 'Multipart photo required');
          if (!photoRoute && contentType.split(';')[0] !== 'application/json')
            return send(res, 415, 'JSON required');
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > limit) return send(res, 413, 'Body too large');
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
          headers['Content-Type'] = contentType;
        }
        const response = await fetch(
          new URL(
            path + url.search,
            targets.user ?? process.env['USER_URL'] ?? 'http://localhost:18081',
          ),
          {
            method: req.method,
            headers,
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(!photoRoute && req.method === 'DELETE' ? 45000 : 12000),
          },
        );
        if (response.status >= 300 && response.status < 400)
          return send(res, 502, 'Unexpected service redirect');
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
          ...(response.headers.get('X-Account-Access') === 'denied' ? { 'X-Account-Access': 'denied' } : {}),
        });
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
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
        } catch (error) {
          // The reason only (never the token): jose and the proof checks name what failed.
          console.warn(
            `auth rejected: ${req.method} ${url.pathname}: ${error?.code ?? ''} ${error?.message ?? error}`,
          );
          res.setHeader('WWW-Authenticate', 'DPoP, Bearer');
          return send(res, 401, 'Invalid or expired session');
        }
      }
      if (identity && !identity.user) return send(res, 403, 'Insufficient role');
      if ((vote || adminRoute || path.endsWith('/mine') || req.method !== 'GET') && !identity)
        return send(res, 401, 'Sign in required');
      if (adminRoute && !identity?.admin) return send(res, 403, 'Administrator required');
      if (adminRoute && !(path.endsWith('/block') ? req.method === 'POST' : req.method === 'GET'))
        return send(res, 405, 'Method not allowed');
      if (
        identity?.admin &&
        !adminRoute &&
        !(req.method === 'GET' && new RegExp(`^/api/v1/polls/${id}$`).test(path))
      )
        return send(res, 403, 'Administrators can only manage users and polls');
      const headers = { Accept: 'application/json' };
      if (identity) {
        const access = await checkAccount(identity);
        if (access !== 204) {
          if (access === 403) res.setHeader('X-Account-Access', 'denied');
          return send(res, access === 403 ? 403 : 503,
            access === 403 ? 'Account access has been revoked' : 'Account access could not be verified');
        }
      }
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
        if (vote && req.method !== 'GET' && metadata.endsAt && Date.parse(metadata.endsAt) <= Date.now())
          return send(res, 409, 'Voting has ended');
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
      if (response.status >= 400)
        console.warn(
          `upstream ${response.status}: ${req.method} ${url.pathname} (${vote ? 'vote' : result ? 'result' : 'poll'}, ${identity ? 'signed in' : 'anonymous'}) ${response.headers.get('www-authenticate') ?? ''}`,
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
  if (!process.env['INTERNAL_AUTH_SECRET']) {
    console.error(
      'INTERNAL_AUTH_SECRET is required: Poll, Vote and Result only accept calls that carry it.',
    );
    process.exit(1);
  }
  const port = Number(process.env['PORT'] ?? 4300);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Votivo server: http://localhost:${port}`));
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
