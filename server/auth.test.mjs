import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  calculateJwkThumbprint,
} from 'jose';
import { createAuthenticator } from './auth.mjs';
import { createApp } from './index.mjs';

const issuer = 'https://identity.test/realms/votivo';
const origin = 'https://votivo.test';
const path = '/api/v1/polls/11111111-1111-4111-8111-111111111111/vote';
const accessKey = await generateKeyPair('RS256');
const jwk = await exportJWK(accessKey.publicKey);
const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] });
const makeAuth = () => createAuthenticator({ issuer, audience: 'poll-service', keySet });
async function token(extra = {}, settings = {}) {
  return new SignJWT({ sub: 'real-user', ...extra })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(settings.issuer ?? issuer)
    .setAudience(settings.audience ?? 'poll-service')
    .setIssuedAt()
    .setExpirationTime(settings.exp ?? '5m')
    .sign(accessKey.privateKey);
}
async function dpop(accessToken, key, extra = {}) {
  return new SignJWT({
    htm: 'POST',
    htu: origin + path,
    ath: createHash('sha256').update(accessToken).digest('base64url'),
    jti: randomUUID(),
    ...extra,
  })
    .setIssuedAt()
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: await exportJWK(key.publicKey) })
    .sign(key.privateKey);
}
test('accepts a signed access token and derives the user and admin role from verified claims', async () => {
  const result = await makeAuth()(
    `Bearer ${await token({ realm_access: { roles: ['ADMIN'] } })}`,
    undefined,
    'POST',
    origin + path,
  );
  assert.equal(result.subject, 'real-user');
  assert.equal(result.admin, true);
});
test('rejects expired tokens, wrong issuer, wrong audience and a forged signature', async () => {
  const auth = makeAuth();
  for (const settings of [
    { exp: '0s' },
    { issuer: 'https://evil.test' },
    { audience: 'other-service' },
  ]) {
    const value = await token({}, settings);
    if (settings.exp)
      await assert.rejects(
        auth(
          `Bearer ${await new SignJWT({ sub: 'u' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(issuer).setAudience('poll-service').setIssuedAt().setExpirationTime(1).sign(accessKey.privateKey)}`,
          undefined,
          'POST',
          origin + path,
        ),
      );
    else await assert.rejects(auth(`Bearer ${value}`, undefined, 'POST', origin + path));
  }
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ sub: 'u' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience('poll-service')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(other.privateKey);
  await assert.rejects(auth(`Bearer ${forged}`, undefined, 'POST', origin + path));
});
test('validates DPoP signature, token binding, URL, method, timestamp and rejects replay', async () => {
  const auth = makeAuth();
  const key = await generateKeyPair('ES256');
  const accessToken = await token({
    cnf: { jkt: await calculateJwkThumbprint(await exportJWK(key.publicKey)) },
  });
  const proof = await dpop(accessToken, key);
  assert.equal(
    (await auth(`DPoP ${accessToken}`, proof, 'POST', origin + path + '?page=1')).subject,
    'real-user',
  );
  await assert.rejects(auth(`DPoP ${accessToken}`, proof, 'POST', origin + path));
  await assert.rejects(auth(`Bearer ${accessToken}`, undefined, 'POST', origin + path));
  for (const extra of [
    { htm: 'GET' },
    { htu: 'https://evil.test' + path },
    { ath: 'wrong' },
    { iat: 1 },
    { iat: Math.floor(Date.now() / 1000) + 3600 },
  ]) {
    let bad;
    if ('iat' in extra)
      bad = await new SignJWT({
        htm: 'POST',
        htu: origin + path,
        ath: createHash('sha256').update(accessToken).digest('base64url'),
        jti: randomUUID(),
        ...extra,
      })
        .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: await exportJWK(key.publicKey) })
        .sign(key.privateKey);
    else bad = await dpop(accessToken, key, extra);
    await assert.rejects(auth(`DPoP ${accessToken}`, bad, 'POST', origin + path));
  }
  const wrongKey = await generateKeyPair('ES256');
  await assert.rejects(
    auth(`DPoP ${accessToken}`, await dpop(accessToken, wrongKey), 'POST', origin + path),
  );
});
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
test('gateway rejects forged identity, protects private results, and forwards only verified X-User-ID', async (t) => {
  const { createServer } = await import('node:http');
  let forwarded;
  let publicAccess = true;
  const backend = createServer((req, res) => {
    if (req.url.endsWith('/vote')) {
      forwarded = req.headers['x-user-id'];
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"voted":false}');
    }
    if (req.url.includes('/by-link/'))
      return res.end(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }));
    if (req.url.includes('/results')) return res.end('{"totalVotes":3}');
    if (!publicAccess) {
      res.writeHead(404);
      return res.end('{}');
    }
    res.end('{}');
  });
  const target = await listen(backend);
  const app = createApp({
    origin: 'http://localhost:4200',
    authenticate: makeAuth(),
    targets: { poll: target, vote: target, result: target },
  });
  const gateway = await listen(app);
  t.after(() => {
    backend.closeAllConnections();
    app.closeAllConnections();
    backend.close();
    app.close();
  });
  assert.equal((await fetch(gateway + path, { headers: { 'X-User-ID': 'fake' } })).status, 401);
  assert.equal(forwarded, undefined);
  const response = await fetch(gateway + path, {
    headers: { Authorization: `Bearer ${await token()}`, 'X-User-ID': 'fake' },
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded, 'real-user');
  publicAccess = false;
  assert.equal((await fetch(gateway + path.replace('/vote', '/results'))).status, 404);
  assert.equal(
    (
      await fetch(
        gateway +
          path.replace('/vote', '/results') +
          '?shareToken=22222222-2222-4222-8222-222222222222',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(gateway + '/api/v1/admin/polls', {
        headers: { Authorization: `Bearer ${await token()}` },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(gateway + '/api/arbitrary')).status, 404);
});

test('serves the silent SSO callback to same-origin frames while protecting other pages', async (t) => {
  const { resolve } = await import('node:path');
  const app = createApp({ root: resolve('public'), authenticate: makeAuth() });
  const base = await listen(app);
  t.after(() => {
    app.closeAllConnections();
    app.close();
  });
  const callback = await fetch(base + '/silent-check-sso.html');
  assert.equal(callback.status, 200);
  assert.equal(callback.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  const settings = await fetch(base + '/auth-config.json');
  assert.equal(settings.headers.get('X-Frame-Options'), 'DENY');
});
