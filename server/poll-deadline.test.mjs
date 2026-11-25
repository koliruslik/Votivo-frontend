import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';

test('gateway rejects vote mutations after deadline but permits status and results', async t => {
  let endsAt = '2000-01-01T00:00:00Z', mutations = 0;
  const backend = createServer((req, res) => {
    if (req.method !== 'GET') mutations++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ endsAt, blocked: false }));
  });
  const listen = async server => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const target = await listen(backend);
  const app = createApp({ checkAccount: async () => 204, origin: 'https://votivo.test',
    authenticate: async () => ({ admin: false, user: true, subject: 'user', token: 'verified' }),
    targets: { poll: target, vote: target, result: target } });
  const gateway = await listen(app);
  t.after(() => { backend.closeAllConnections(); app.closeAllConnections(); backend.close(); app.close(); });
  const path = '/api/v1/polls/11111111-1111-4111-8111-111111111111';
  const headers = { Authorization: 'Bearer verified', 'Content-Type': 'application/json' };
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal((await fetch(gateway + path + '/vote', { method, headers })).status, 409);
  assert.equal(mutations, 0);
  assert.equal((await fetch(gateway + path + '/vote', { headers })).status, 200);
  assert.equal((await fetch(gateway + path + '/results', { headers })).status, 200);
  endsAt = '2099-12-31T12:00:00Z';
  assert.equal((await fetch(gateway + path + '/vote', { method: 'POST', headers })).status, 200);
  assert.equal(mutations, 1);
});
