import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  calculateJwkThumbprint,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';

const issuer = 'http://localhost:18089/realms/test';
const key = await generateKeyPair('RS256');
const codes = new Map();
function redirect(res, target, params, mode) {
  const url = new URL(target);
  if (mode === 'query')
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  else url.hash = new URLSearchParams(params).toString();
  res.writeHead(302, { Location: url.href });
  res.end();
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, issuer);
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, DPoP, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname.endsWith('/jwks')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        keys: [{ ...(await exportJWK(key.publicKey)), kid: 'ui-check', alg: 'RS256', use: 'sig' }],
      }),
    );
  }
  if (url.pathname.includes('/3p-cookies/')) {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<script>parent.postMessage("supported", "*")</script>');
  }
  if (url.pathname.endsWith('/.well-known/openid-configuration')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: issuer + '/auth',
        token_endpoint: issuer + '/token',
        end_session_endpoint: issuer + '/logout',
        dpop_signing_alg_values_supported: ['ES256'],
      }),
    );
  }
  if (url.pathname.endsWith('/auth')) {
    const target = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const mode = url.searchParams.get('response_mode');
    if (url.searchParams.get('prompt') === 'none') {
      if (!req.headers.cookie?.includes('votivo-test-session=active'))
        return redirect(res, target, { error: 'login_required', state, iss: issuer }, mode);
      const code = randomUUID();
      codes.set(code, { nonce: url.searchParams.get('nonce') });
      return redirect(res, target, { code, state, session_state: randomUUID(), iss: issuer }, mode);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const escaped = url.search.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return res.end(
      `<!doctype html><html lang="en"><title>Test identity provider</title><body><h1>Test sign-in</h1><p>Local identity fixture for browser checks.</p><form action="${issuer}/complete${escaped}" method="POST"><button>Continue as test user</button></form></body></html>`,
    );
  }
  if (url.pathname.endsWith('/complete')) {
    res.setHeader(
      'Set-Cookie',
      'votivo-test-session=active; HttpOnly; SameSite=Lax; Path=/realms/test',
    );
    const code = randomUUID();
    codes.set(code, { nonce: url.searchParams.get('nonce') });
    return redirect(
      res,
      url.searchParams.get('redirect_uri'),
      { code, state: url.searchParams.get('state'), session_state: randomUUID(), iss: issuer },
      url.searchParams.get('response_mode'),
    );
  }
  if (url.pathname.endsWith('/token')) {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = new URLSearchParams(Buffer.concat(chunks).toString());
    const code = codes.get(body.get('code'));
    codes.delete(body.get('code'));
    if (!code && body.get('grant_type') !== 'refresh_token') {
      res.writeHead(400);
      return res.end('{}');
    }
    let cnf;
    if (req.headers.dpop)
      cnf = { jkt: await calculateJwkThumbprint(decodeProtectedHeader(req.headers.dpop).jwk) };
    const claims = {
      sub: 'e2e-user',
      preferred_username: 'alex',
      name: 'Alex Morgan',
      realm_access: { roles: ['ADMIN'] },
      ...(cnf ? { cnf } : {}),
    };
    const sign = (extra, aud) =>
      new SignJWT({ ...claims, ...extra })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ui-check' })
        .setIssuer(issuer)
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(key.privateKey);
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        access_token: await sign({}, 'poll-service'),
        id_token: await sign({ nonce: code?.nonce }, 'votivo-frontend'),
        refresh_token: await sign({}, 'votivo-frontend'),
        token_type: cnf ? 'DPoP' : 'Bearer',
        expires_in: 600,
        refresh_expires_in: 600,
        session_state: randomUUID(),
      }),
    );
  }
  if (url.pathname.endsWith('/logout')) {
    res.setHeader(
      'Set-Cookie',
      'votivo-test-session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/realms/test',
    );
    return redirect(
      res,
      url.searchParams.get('post_logout_redirect_uri') ?? 'http://localhost:4200',
      {},
      'query',
    );
  }
  res.writeHead(404);
  res.end();
});
server.listen(18089, '127.0.0.1', () => console.log('Test OIDC: http://localhost:18089'));
process.on('SIGTERM', () => server.close());
