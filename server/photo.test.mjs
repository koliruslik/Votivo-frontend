import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './index.mjs';

const origin = 'https://votivo.test';
const path = '/api/v1/users/me/photo';
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

test('photo gateway preserves multipart bytes, DPoP identity, binary content and deletion', async (t) => {
  const calls = [];
  const image = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0xff, 0xd9]);
  const backend = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(image);
    } else {
      res.writeHead(204);
      res.end();
    }
  });
  const target = await listen(backend);
  const authenticated = [];
  const gateway = createApp({ checkAccount: async () => 204,
    origin,
    targets: { user: target },
    authenticateUser: async (...args) => {
      authenticated.push(args);
      return { subject: 'owner', user: true };
    },
  });
  const address = await listen(gateway);
  t.after(() => {
    backend.closeAllConnections();
    gateway.closeAllConnections();
    backend.close();
    gateway.close();
  });
  const headers = { Authorization: 'DPoP test-token', DPoP: 'test-proof', Origin: origin };
  const form = new FormData();
  form.append('file', new Blob([image], { type: 'image/jpeg' }), 'profile.jpg');
  const put = await fetch(address + path, { method: 'PUT', headers, body: form });
  assert.equal(put.status, 204);
  assert.equal(calls[0].headers.authorization, headers.Authorization);
  assert.equal(calls[0].headers.dpop, headers.DPoP);
  assert.match(calls[0].headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.ok(calls[0].body.includes(image));
  assert.ok(calls[0].body.includes(Buffer.from('name="file"; filename="profile.jpg"')));
  assert.equal(calls[0].headers['x-forwarded-host'], 'votivo.test');
  assert.equal(authenticated[0][2], 'PUT');
  assert.equal(authenticated[0][3], origin + path);
  const get = await fetch(address + path, { headers });
  assert.equal(get.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(get.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), image);
  assert.equal((await fetch(address + path, { method: 'DELETE', headers })).status, 204);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['PUT', 'GET', 'DELETE'],
  );
});

test('photo gateway rejects missing auth, foreign origins, wrong media and oversize uploads', async (t) => {
  let forwarded = 0;
  const backend = createServer((_req, res) => {
    forwarded++;
    res.writeHead(204);
    res.end();
  });
  const target = await listen(backend);
  const gateway = createApp({ checkAccount: async () => 204,
    origin,
    targets: { user: target },
    authenticateUser: async (authorization) => {
      if (authorization !== 'Bearer valid') throw new Error('Rejected');
      return { subject: 'owner', user: true };
    },
  });
  const address = await listen(gateway);
  t.after(() => {
    backend.closeAllConnections();
    gateway.closeAllConnections();
    backend.close();
    gateway.close();
  });
  const headers = { Authorization: 'Bearer valid' };
  assert.equal((await fetch(address + path)).status, 401);
  assert.equal(
    (await fetch(address + path, { headers: { Authorization: 'Bearer invalid' } })).status,
    401,
  );
  assert.equal(
    (await fetch(address + path, { headers: { ...headers, Origin: 'https://other.test' } })).status,
    403,
  );
  assert.equal((await fetch(address + path, { method: 'POST', headers })).status, 405);
  assert.equal(
    (
      await fetch(address + path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(address + path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
        body: 'no boundary',
      })
    ).status,
    415,
  );
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(6 * 1024 * 1024 + 1)]), 'large.jpg');
  assert.equal((await fetch(address + path, { method: 'PUT', headers, body: form })).status, 413);
  assert.equal(forwarded, 0);
});
