import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';

test('account deletion forwards the original identity and preserves conflict, accepted and no-content responses', async (t) => {
  let status = 409;
  const seen = [];
  const backend = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, headers: req.headers });
    res.writeHead(status, { 'Content-Type': 'application/problem+json' });
    res.end(
      status === 409
        ? JSON.stringify({ code: 'account.unfinished-polls', status: 409 })
        : undefined,
    );
  });
  async function listen(server) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + server.address().port;
  }
  const target = await listen(backend);
  const gateway = createApp({ checkAccount: async () => 204,
    origin: 'https://votivo.test',
    targets: { user: target },
    authenticateUser: async () => ({ subject: 'owner', user: true }),
  });
  const address = await listen(gateway);
  t.after(() => {
    backend.closeAllConnections();
    gateway.closeAllConnections();
    backend.close();
    gateway.close();
  });
  const path = '/api/v1/users/me';
  assert.equal((await fetch(address + path, { method: 'DELETE' })).status, 401);
  const headers = { Authorization: 'DPoP token', DPoP: 'proof', Origin: 'https://votivo.test' };
  let response = await fetch(address + path, { method: 'DELETE', headers });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account.unfinished-polls');
  for (status of [202, 204]) {
    response = await fetch(address + path, { method: 'DELETE', headers });
    assert.equal(response.status, status);
    assert.equal(await response.text(), '');
  }
  assert.equal(seen.length, 3);
  assert.equal(seen[0].headers.authorization, 'DPoP token');
  assert.equal(seen[0].headers.dpop, 'proof');
  assert.equal(seen[0].method, 'DELETE');
  assert.equal(seen[0].path, path);
  assert.equal(seen[0].headers['x-account-deletion-secret'], undefined);
});
