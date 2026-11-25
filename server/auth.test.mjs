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
const makeAuth = () =>
  createAuthenticator({ issuer, audience: 'poll-service', keySet, requireDpop: false });
const makeStrictAuth = () => createAuthenticator({ issuer, audience: 'poll-service', keySet });
async function token(extra = {}, settings = {}) {
  return new SignJWT({
    sub: 'real-user',
    typ: 'Bearer',
    realm_access: { roles: ['user'] },
    ...extra,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(settings.issuer ?? issuer)
    .setAudience(settings.audience ?? 'poll-service')
    .setIssuedAt()
    .setExpirationTime(settings.exp ?? '5m')
    .sign(accessKey.privateKey);
}
async function dpop(accessToken, key, extra = {}, method = 'POST', targetPath = path) {
  return new SignJWT({
    htm: method,
    htu: origin + targetPath,
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
    `Bearer ${await token({ realm_access: { roles: ['admin'] } })}`,
    undefined,
    'POST',
    origin + path,
  );
  assert.equal(result.subject, 'real-user');
  assert.equal(result.admin, true);
  assert.equal(result.user, true, 'admin includes the user role');
});
test('maps the Keycloak realm roles user and admin exactly', async () => {
  const roles = async (list) =>
    makeAuth()(
      `Bearer ${await token({ realm_access: { roles: list } })}`,
      undefined,
      'GET',
      origin + path,
    );
  assert.deepEqual(((r) => [r.user, r.admin])(await roles(['user'])), [true, false]);
  assert.deepEqual(((r) => [r.user, r.admin])(await roles(['admin'])), [true, true]);
  assert.deepEqual(((r) => [r.user, r.admin])(await roles(['offline_access'])), [false, false]);
  // Role names are lower case in the realm: look-alikes grant nothing.
  assert.deepEqual(((r) => [r.user, r.admin])(await roles(['ADMIN', 'USER'])), [false, false]);
});
test('accepts only access tokens: ID, refresh and untyped tokens are refused', async () => {
  const auth = makeAuth();
  // Keycloak types a DPoP-bound access token `DPoP`; it must pass, the other token kinds must not.
  assert.equal(
    (await auth(`Bearer ${await token({ typ: 'DPoP' })}`, undefined, 'GET', origin + path)).subject,
    'real-user',
  );
  for (const extra of [{ typ: 'ID' }, { typ: 'Refresh' }, { typ: 'Offline' }, { typ: undefined }])
    await assert.rejects(
      auth(`Bearer ${await token(extra)}`, undefined, 'GET', origin + path),
      /access token/i,
    );
});
test('refuses unsigned and algorithm-confused tokens', async () => {
  const auth = makeAuth();
  const body = Buffer.from(
    JSON.stringify({ sub: 'u', typ: 'Bearer', iss: issuer, aud: 'poll-service', exp: 9999999999 }),
  ).toString('base64url');
  const none = Buffer.from('{"alg":"none"}').toString('base64url');
  await assert.rejects(auth(`Bearer ${none}.${body}.`, undefined, 'GET', origin + path));
  // HS256 signed with the public key as the secret (classic key-confusion attack).
  const hs = await new SignJWT({ sub: 'u', typ: 'Bearer' })
    .setProtectedHeader({ alg: 'HS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience('poll-service')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(JSON.stringify(jwk)));
  await assert.rejects(auth(`Bearer ${hs}`, undefined, 'GET', origin + path));
});
test('requires a DPoP-bound token by default (no Bearer downgrade through an unbound token)', async () => {
  const unbound = await token();
  await assert.rejects(
    makeStrictAuth()(`Bearer ${unbound}`, undefined, 'GET', origin + path),
    /DPoP-bound/,
  );
  await assert.rejects(
    makeStrictAuth()(`DPoP ${unbound}`, 'x.y.z', 'GET', origin + path),
    /DPoP-bound/,
  );
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
  await assert.rejects(
    auth(`DPoP ${accessToken}`, undefined, 'POST', origin + path),
    /DPoP required/,
  );
  const noType = await new SignJWT({
    htm: 'POST',
    htu: origin + path,
    ath: createHash('sha256').update(accessToken).digest('base64url'),
    jti: randomUUID(),
  })
    .setIssuedAt()
    .setProtectedHeader({ alg: 'ES256', jwk: await exportJWK(key.publicKey) })
    .sign(key.privateKey);
  await assert.rejects(auth(`DPoP ${accessToken}`, noType, 'POST', origin + path));
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
  let internal;
  let publicAccess = true;
  const backend = createServer((req, res) => {
    internal = req.headers['x-internal-auth'];
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
  const app = createApp({ checkAccount: async () => 204,
    origin: 'http://localhost:4200',
    authenticate: makeAuth(),
    internalSecret: 'gateway-secret',
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
  assert.equal(
    internal,
    'gateway-secret',
    'services only trust calls that carry the gateway secret',
  );
  const roleless = await fetch(gateway + path, {
    headers: { Authorization: `Bearer ${await token({ realm_access: { roles: [] } })}` },
  });
  assert.equal(roleless.status, 403, 'a valid token without user/admin role is refused');
  const idToken = await fetch(gateway + path, {
    headers: { Authorization: `Bearer ${await token({ typ: 'ID' })}` },
  });
  assert.equal(idToken.status, 401);
  assert.equal(
    (
      await fetch(gateway + '/api/v1/admin/polls', {
        headers: {
          Authorization: `Bearer ${await token({ realm_access: { roles: ['admin'] } })}`,
        },
      })
    ).status,
    200,
  );
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

test('gateway authenticates User Service requests and forwards the original DPoP identity safely', async (t) => {
  const headerPath = '/api/v1/users/me/header';
  const profilePath = '/api/v1/users/me';
  let forwarded;
  let forwardedBody;
  const backend = (await import('node:http')).createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    forwardedBody = Buffer.concat(chunks).toString();
    forwarded = {
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      dpop: req.headers.dpop,
      proto: req.headers['x-forwarded-proto'],
      host: req.headers['x-forwarded-host'],
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }));
  });
  const target = await listen(backend);
  const authenticateUser = createAuthenticator({ issuer, audience: 'user-service', keySet, requireDpop: false });
  const app = createApp({ checkAccount: async () => 204,
    origin,
    authenticate: makeAuth(),
    authenticateUser,
    targets: { user: target, poll: target, vote: target, result: target },
  });
  const gateway = await listen(app);
  t.after(() => {
    backend.closeAllConnections();
    app.closeAllConnections();
    backend.close();
    app.close();
  });

  assert.equal((await fetch(gateway + headerPath)).status, 401);
  assert.equal((await fetch(gateway + headerPath, {
    headers: { Authorization: `Bearer ${await token()}` },
  })).status, 401, 'poll-service audience is not accepted for User Service routes');
  assert.equal((await fetch(gateway + headerPath, { method: 'POST' })).status, 405);

  const key = await generateKeyPair('ES256');
  const userToken = await token({
    cnf: { jkt: await calculateJwkThumbprint(await exportJWK(key.publicKey)) },
  }, { audience: 'user-service' });
  const headerProof = await dpop(userToken, key, {}, 'GET', headerPath);
  const headerResponse = await fetch(gateway + headerPath, {
    headers: { Authorization: `DPoP ${userToken}`, DPoP: headerProof, Origin: origin },
  });
  assert.equal(headerResponse.status, 200);
  assert.deepEqual(await headerResponse.json(), { firstName: 'Ada', lastName: 'Lovelace' });
  assert.deepEqual(forwarded, {
    method: 'GET', url: headerPath, authorization: `DPoP ${userToken}`,
    dpop: headerProof, proto: 'https', host: 'votivo.test',
  });

  const patchProof = await dpop(userToken, key, {}, 'PATCH', profilePath);
  const patchBody = JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' });
  const patchResponse = await fetch(gateway + profilePath, {
    method: 'PATCH',
    headers: {
      Authorization: `DPoP ${userToken}`, DPoP: patchProof, Origin: origin,
      'Content-Type': 'application/json',
    },
    body: patchBody,
  });
  assert.equal(patchResponse.status, 200);
  assert.equal(forwardedBody, patchBody);
  assert.equal(forwarded.method, 'PATCH');
  assert.equal(forwarded.url, profilePath);
  assert.equal(forwarded.authorization, `DPoP ${userToken}`);
  assert.equal(forwarded.dpop, patchProof);
});

test('serves the silent SSO callback to same-origin frames while protecting other pages', async (t) => {
  const { resolve } = await import('node:path');
  const app = createApp({ checkAccount: async () => 204, root: resolve('public'), authenticate: makeAuth() });
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
