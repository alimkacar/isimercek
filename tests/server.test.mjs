import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

test('local server exposes public model assets only and accepts no uploaded profile data', async () => {
  const server = createAppServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const model = await fetch(base + '/model.json');
    assert.equal(model.status, 200);
    assert.match(model.headers.get('content-type'), /application\/json/);
    assert.equal((await model.json()).modelType, 'multilabel_logistic_regression');
    assert.equal((await fetch(base + '/model.json', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/.env')).status, 404);
    assert.equal((await fetch(base + '/%00')).status, 404);
    assert.equal((await fetch(base + '/%zz')).status, 400);
    assert.equal((await fetch(base + '/model.json', { method: 'POST', body: '{}' })).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('extraction endpoint is the only write route, reports a missing key and never serves server files', async () => {
  const server = createAppServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await fetch(base + '/api/extract');
    assert.equal(status.status, 200);
    assert.equal((await status.json()).configured, false);
    const post = await fetch(base + '/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Elektrik 1.000 kWh' }) });
    assert.equal(post.status, 503);
    assert.match((await post.json()).error, /anahtarı tanımlı değil/);
    assert.equal((await fetch(base + '/api/extract', { method: 'POST', body: '{bozuk' })).status, 400);
    assert.equal((await fetch(base + '/api/extract', { method: 'PUT', body: '{}' })).status, 405);
    assert.equal((await fetch(base + '/api/extract', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"text":"x"}' })).status, 403);
    assert.equal((await fetch(base + '/lib/extract-core.mjs')).status, 404);
    assert.equal((await fetch(base + '/extraction.mjs')).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
