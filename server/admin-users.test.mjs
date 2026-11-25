import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';
import { createAuthenticator } from './auth.mjs';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';

test('admin users API verifies roles and audience and forwards search, paging and status changes', async (t) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keySet = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: 'admin-test' }],
  });
  const issuer = 'https://issuer.test/realms/votivo';
  const authenticateUser = createAuthenticator({
    issuer,
    audience: 'user-service',
    keySet,
    requireDpop: false,
  });
  const token = (role, audience = 'user-service') =>
    new SignJWT({ sub: 'admin', typ: 'Bearer', realm_access: { roles: [role] } })
      .setProtectedHeader({ alg: 'RS256', kid: 'admin-test' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  const seen = [];
  const backend = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      body: Buffer.concat(chunks).toString(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"items":[]}');
  });
  async function listen(server) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + server.address().port;
  }
  const target = await listen(backend);
  const app = createApp({ checkAccount: async () => 204,
    origin: 'https://votivo.test',
    authenticateUser,
    targets: { user: target },
  });
  const gateway = await listen(app),
    path = '/api/v1/admin/users';
  t.after(() => {
    backend.closeAllConnections();
    app.closeAllConnections();
    backend.close();
    app.close();
  });
  assert.equal((await fetch(gateway + path)).status, 401);
  assert.equal(
    (await fetch(gateway + path, { headers: { Authorization: 'Bearer ' + (await token('user')) } }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(gateway + path, {
        headers: { Authorization: 'Bearer ' + (await token('admin', 'poll-service')) },
      })
    ).status,
    401,
  );
  const admin = await token('admin'),
    headers = { Authorization: 'Bearer ' + admin };
  const query = '?page=2&size=20&search=Ada%20Lovelace&enabled=false';
  assert.equal((await fetch(gateway + path + query, { headers })).status, 200);
  assert.equal(seen[0].url, path + query);
  assert.equal(seen[0].authorization, 'Bearer ' + admin);
  const statusPath = path + '/11111111-1111-4111-8111-111111111111/status';
  assert.equal(
    (
      await fetch(gateway + statusPath, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{"enabled":false}',
      })
    ).status,
    200,
  );
  assert.equal(seen[1].body, '{"enabled":false}');
  assert.equal(seen[1].method, 'PATCH');
  assert.equal((await fetch(gateway + statusPath, { method: 'DELETE', headers })).status, 405);
  assert.equal(seen.length, 2);
});
