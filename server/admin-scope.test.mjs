import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';

test('administrator gateway only permits user moderation, poll review and poll blocking', async (t) => {
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  const listen = async (server) => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const target = await listen(upstream);
  const identity = async () => ({ admin: true, user: true, token: 'verified', subject: 'admin' });
  const app = createApp({ checkAccount: async () => 204, origin: 'https://votivo.test', authenticate: identity,
    authenticateUser: identity, targets: { user: target, poll: target, vote: target, result: target } });
  const gateway = await listen(app);
  t.after(() => { app.closeAllConnections(); upstream.closeAllConnections(); app.close(); upstream.close(); });
  const id = '11111111-1111-4111-8111-111111111111';
  const headers = { Authorization: 'Bearer verified', 'Content-Type': 'application/json' };
  for (const [method, path] of [
    ['GET', '/api/v1/admin/users'], ['GET', '/api/v1/users/me/header'],
    ['GET', '/api/v1/admin/polls'], ['GET', `/api/v1/polls/${id}`],
    ['POST', `/api/v1/admin/polls/${id}/block`],
    ['PATCH', `/api/v1/admin/users/${id}/status`],
  ]) assert.equal((await fetch(gateway + path, { method, headers })).status, 200, path);
  const permitted = seen.length;
  for (const [method, path] of [
    ['GET', '/api/v1/users/me'], ['DELETE', '/api/v1/users/me'],
    ['GET', '/api/v1/users/me/photo'], ['DELETE', '/api/v1/users/me/photo'],
    ['GET', '/api/v1/polls'], ['GET', '/api/v1/polls/mine'], ['POST', '/api/v1/polls'],
    ['PUT', `/api/v1/polls/${id}`], ['DELETE', `/api/v1/polls/${id}`],
    ...['publish', 'close', 'archive'].map(action => ['POST', `/api/v1/polls/${id}/${action}`]),
    ['GET', `/api/v1/polls/${id}/results`],
    ...['GET', 'POST', 'PUT', 'DELETE'].map(method => [method, `/api/v1/polls/${id}/vote`]),
  ]) assert.equal((await fetch(gateway + path, { method, headers })).status, 403, `${method} ${path}`);
  assert.equal(seen.length, permitted);
});
