import assert from 'node:assert/strict';
import test from 'node:test';
import { TapService } from '../lib-esm/astronomy/tap/index.js';
import { ServiceError } from '../lib-esm/index.js';

test('TAP Sync posts ADQL form and returns unmodified response', async () => {
  let sent;
  const tap = new TapService({
    endpoint: 'https://archive.example/tap/',
    transport: { getText: async () => { throw Error('unexpected GET'); }, request: async (url, options) => {
      sent = { url, options };
      return { status: 200, headers: new Headers({ 'content-type': 'text/csv' }), body: 'ra,dec\n1,2\n' };
    } },
  });
  const result = await tap.querySync({ adql: 'SELECT TOP 1 ra, dec FROM foo', format: 'csv', maxrec: 20 });
  assert.equal(sent.url, 'https://archive.example/tap/sync');
  assert.equal(sent.options.method, 'POST');
  assert.match(sent.options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(sent.options.body)), {
    REQUEST: 'doQuery', LANG: 'ADQL', QUERY: 'SELECT TOP 1 ra, dec FROM foo', FORMAT: 'csv', MAXREC: '20',
  });
  assert.equal(result.body, 'ra,dec\n1,2\n');
  assert.equal(result.contentType, 'text/csv');
});

test('accepts existing sync endpoint and passes cancellation and timeout', async () => {
  const controller = new AbortController();
  let captured;
  const tap = new TapService({ endpoint: 'https://archive.example/tap/sync', timeoutMs: 1500, transport: {
    getText: async () => '', request: async (url, options) => {
      captured = { url, options };
      return { status: 200, headers: new Headers(), body: '<VOTABLE />' };
    },
  } });
  await tap.querySync({ adql: 'SELECT * FROM t', signal: controller.signal });
  assert.equal(captured.url, 'https://archive.example/tap/sync');
  assert.equal(captured.options.signal, controller.signal);
  assert.equal(captured.options.timeoutMs, 1500);
  assert.equal(new URLSearchParams(captured.options.body).get('FORMAT'), 'votable');
});

test('rejects invalid endpoint, blank ADQL and invalid maxrec', async () => {
  assert.throws(() => new TapService({ endpoint: 'file:///tmp/tap' }), TypeError);
  assert.throws(() => new TapService({ endpoint: 'https://u:p@host/tap' }), TypeError);
  assert.throws(() => new TapService({ endpoint: 'https://host/tap?x=1' }), TypeError);
  const tap = new TapService({ endpoint: 'https://host/tap' });
  await assert.rejects(tap.querySync({ adql: '  ' }), TypeError);
  await assert.rejects(tap.querySync({ adql: 'SELECT 1', maxrec: -1 }), RangeError);
});

test('requires POST-capable transport', async () => {
  const tap = new TapService({ endpoint: 'https://host/tap', transport: { getText: async () => '' } });
  await assert.rejects(tap.querySync({ adql: 'SELECT 1' }), error => error instanceof ServiceError && error.code === 'INVALID_RESPONSE');
});

test('propagates transport errors without converting them', async () => {
  const failure = new ServiceError('TIMEOUT', 'timeout');
  const tap = new TapService({ endpoint: 'https://host/tap', transport: {
    getText: async () => '', request: async () => { throw failure; },
  } });
  await assert.rejects(tap.querySync({ adql: 'SELECT 1' }), error => error === failure);
});
