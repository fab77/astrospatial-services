import assert from 'node:assert/strict';
import test from 'node:test';
import { FetchHttpTransport } from '../lib-esm/index.js';

test('GET response includes status, headers and body', async () => {
  const transport = new FetchHttpTransport(async (_url, init) => {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Accept, 'text/plain');
    return new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } });
  });
  const response = await transport.request('https://example.org', { headers: { Accept: 'text/plain' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/plain');
  assert.equal(response.body, 'hello');
});

test('POST sends ADQL form body and headers', async () => {
  const transport = new FetchHttpTransport(async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.body, 'QUERY=SELECT+1');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    return new Response('result');
  });
  assert.equal((await transport.request('https://example.org/tap/sync', {
    method: 'POST', body: 'QUERY=SELECT+1',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })).body, 'result');
});

test('getText preserves existing behavior', async () => {
  const transport = new FetchHttpTransport(async () => new Response('legacy'));
  assert.equal(await transport.getText('https://example.org'), 'legacy');
});

test('rejects GET body and invalid timeout', async () => {
  const transport = new FetchHttpTransport();
  await assert.rejects(transport.request('https://example.org', { body: 'x' }), TypeError);
  await assert.rejects(transport.request('https://example.org', { timeoutMs: 0 }), RangeError);
});

test('propagates HTTP failure', async () => {
  const transport = new FetchHttpTransport(async () => new Response('fail', { status: 429 }));
  await assert.rejects(transport.request('https://example.org'), { code: 'HTTP', status: 429 });
});

test('propagates network failure', async () => {
  const transport = new FetchHttpTransport(async () => { throw new TypeError('offline'); });
  await assert.rejects(transport.request('https://example.org'), { code: 'NETWORK' });
});

test('propagates pre-aborted caller signal', async () => {
  const controller = new AbortController();
  controller.abort();
  const transport = new FetchHttpTransport(async (_url, init) => {
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response('unexpected');
  });
  await assert.rejects(transport.request('https://example.org', { signal: controller.signal }), { code: 'ABORTED' });
});

test('classifies timeout', async () => {
  const transport = new FetchHttpTransport((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(transport.request('https://example.org', { timeoutMs: 10 }), { code: 'TIMEOUT' });
});
