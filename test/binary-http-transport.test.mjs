import assert from 'node:assert/strict';
import test from 'node:test';
import { FetchBinaryHttpTransport } from '../lib-esm/index.js';

test('downloads a binary response and verifies its declared and actual length', async () => {
  const transport = new FetchBinaryHttpTransport(async (_url, init) => {
    assert.equal(init.method, 'GET');
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'content-length': '4' },
    });
  });
  const response = await transport.getArrayBuffer('https://example.test/data.img', {
    expectedByteLength: 4,
  });
  assert.deepEqual([...new Uint8Array(response.body)], [1, 2, 3, 4]);
});

test('rejects a mismatching Content-Length before reading the body', async () => {
  const transport = new FetchBinaryHttpTransport(async () => new Response(
    new Uint8Array([1, 2]),
    { headers: { 'content-length': '2' } },
  ));
  await assert.rejects(
    transport.getArrayBuffer('https://example.test/data.img', { expectedByteLength: 4 }),
    { code: 'INVALID_RESPONSE' },
  );
});

test('verifies an expected SHA-256 digest', async () => {
  const transport = new FetchBinaryHttpTransport(async () => new Response(new Uint8Array([1, 2, 3, 4])));
  const expectedSha256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
  await transport.getArrayBuffer('https://example.test/data.img', { expectedSha256 });
  await assert.rejects(
    transport.getArrayBuffer('https://example.test/data.img', { expectedSha256: '0'.repeat(64) }),
    { code: 'INVALID_RESPONSE' },
  );
});

test('validates binary URLs, expected length and caller cancellation', async () => {
  const transport = new FetchBinaryHttpTransport(async (_url, init) => {
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(new Uint8Array());
  });
  await assert.rejects(transport.getArrayBuffer('file:///tmp/data.img'), TypeError);
  await assert.rejects(
    transport.getArrayBuffer('https://example.test/data.img', { expectedByteLength: -1 }),
    RangeError,
  );
  await assert.rejects(
    transport.getArrayBuffer('https://example.test/data.img', { expectedSha256: 'bad' }),
    TypeError,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transport.getArrayBuffer('https://example.test/data.img', { signal: controller.signal }),
    { code: 'ABORTED' },
  );
});
