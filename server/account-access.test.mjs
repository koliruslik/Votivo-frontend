import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';

test('blocking revokes old JWT access, preserves active polls and votes, and unblocking never unblocks a poll', async t => {
  const user = '11111111-1111-4111-8111-111111111111';
  const admin = '22222222-2222-4222-8222-222222222222';
  const poll = '33333333-3333-4333-8333-333333333333';
  let enabled = true, blocked = false, votes = 7, accessStatus = 204, mutations = 0, revokedAt = 0;
  const checks = [];
  const backend = createServer(async (req, res) => {
    if (req.url.startsWith('/internal/v1/users/')) {
      checks.push(req.url);
      assert.equal(req.headers['x-internal-auth'], 'test-gateway-secret');
      assert.equal(req.headers.authorization, undefined);
      const issuedAt = Number(new URL(req.url, 'http://test').searchParams.get('issuedAt'));
      res.writeHead(req.url.includes(user) && (!enabled || issuedAt <= revokedAt) ? 403 : accessStatus);
      return res.end();
    }
    if (req.url.endsWith('/status')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      enabled = JSON.parse(body).enabled;
      if (!enabled) revokedAt = 100;
    } else if (req.url.endsWith('/block')) blocked = true;
    else if (req.method !== 'GET') { mutations++; votes++; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: poll, ownerId: user, status: 'PUBLISHED', blocked, votes,
      endsAt: '2099-12-31T12:00:00Z' }));
  });
  const listen = async server => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const target = await listen(backend);
  const app = createApp({ origin: 'https://votivo.test', internalSecret: 'test-gateway-secret',
    authenticate: async header => ({ subject: header === 'Bearer admin' ? admin : user,
      issuedAt: header === 'Bearer fresh-user-token' ? 200 : 50,
      admin: header === 'Bearer admin', user: true, token: header }),
    targets: { user: target, poll: target, vote: target, result: target } });
  const gateway = await listen(app);
  t.after(() => { app.closeAllConnections(); backend.closeAllConnections(); app.close(); backend.close(); });
  const headers = { Authorization: 'Bearer still-valid-old-user-token', 'Content-Type': 'application/json' };
  const adminHeaders = { Authorization: 'Bearer admin', 'Content-Type': 'application/json' };
  const statusPath = `/api/v1/admin/users/${user}/status`;
  const base = `/api/v1/polls/${poll}`;
  assert.equal((await fetch(gateway + '/api/v1/polls/mine', { headers })).status, 200);
  assert.equal((await fetch(gateway + statusPath, { method: 'PATCH', headers: adminHeaders, body: '{"enabled":false}' })).status, 200);
  for (const [method, path] of [
    ['POST', '/api/v1/polls'], ['GET', '/api/v1/polls/mine'], ['PUT', base], ['DELETE', base],
    ...['publish', 'close', 'archive'].map(action => ['POST', `${base}/${action}`]),
    ...['GET', 'POST', 'PUT', 'DELETE'].map(method => [method, `${base}/vote`]),
    ['GET', `${base}/results`],
  ]) {
    const response = await fetch(gateway + path, { method, headers });
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(response.headers.get('X-Account-Access'), 'denied');
  }
  assert.equal(mutations, 0);
  const publicPoll = await (await fetch(gateway + base)).json();
  assert.equal(publicPoll.status, 'PUBLISHED');
  assert.equal(publicPoll.blocked, false);
  assert.equal(publicPoll.votes, 7);
  assert.equal((await fetch(gateway + `/api/v1/admin/polls/${poll}/block`, { method: 'POST', headers: adminHeaders })).status, 200);
  assert.equal((await fetch(gateway + statusPath, { method: 'PATCH', headers: adminHeaders, body: '{"enabled":true}' })).status, 200);
  assert.equal((await fetch(gateway + '/api/v1/polls/mine', { headers })).status, 403);
  headers.Authorization = 'Bearer fresh-user-token';
  assert.equal((await fetch(gateway + '/api/v1/polls/mine', { headers })).status, 200);
  assert.equal((await fetch(gateway + base + '/vote', { method: 'POST', headers })).status, 404);
  assert.equal(blocked, true);
  assert.equal(votes, 7);
  assert.ok(checks.some(path => path.includes(admin) && path.endsWith('&admin=true')));
  accessStatus = 503;
  assert.equal((await fetch(gateway + '/api/v1/polls', { method: 'POST', headers })).status, 503);
  assert.equal(mutations, 0);
});
