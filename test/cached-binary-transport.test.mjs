import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CachedBinaryHttpTransport,
  binaryCachePath,
} from '../lib-esm/planetary/node/index.js';

async function withCache(run) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'astrospatial-cache-test-'));
  try {
    await run(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

test('downloads once, writes atomically and reuses the cached binary', async () => {
  await withCache(async (cacheDir) => {
    let calls = 0;
    const transport = new CachedBinaryHttpTransport({
      cacheDir,
      upstream: {
        async getArrayBuffer() {
          calls++;
          return {
            status: 200,
            headers: new Headers(),
            body: new Uint8Array([1, 2, 3, 4]),
          };
        },
      },
    });
    const url = 'https://example.test/large.img';
    const first = await transport.getArrayBuffer(url, { expectedByteLength: 4 });
    const second = await transport.getArrayBuffer(url, { expectedByteLength: 4 });
    assert.equal(calls, 1);
    assert.equal(first.headers.get('x-astrospatial-cache'), null);
    assert.equal(second.headers.get('x-astrospatial-cache'), 'HIT');
    assert.deepEqual([...await readFile(binaryCachePath(cacheDir, url))], [1, 2, 3, 4]);
  });
});

test('removes a stale wrong-sized entry and downloads it again', async () => {
  await withCache(async (cacheDir) => {
    const url = 'https://example.test/large.img';
    await writeFile(binaryCachePath(cacheDir, url), new Uint8Array([9]));
    let calls = 0;
    const transport = new CachedBinaryHttpTransport({
      cacheDir,
      upstream: {
        async getArrayBuffer() {
          calls++;
          return { status: 200, headers: new Headers(), body: new Uint8Array([1, 2]) };
        },
      },
    });
    const response = await transport.getArrayBuffer(url, { expectedByteLength: 2 });
    assert.equal(calls, 1);
    assert.deepEqual([...response.body], [1, 2]);
    assert.deepEqual([...await readFile(binaryCachePath(cacheDir, url))], [1, 2]);
  });
});

test('deduplicates concurrent downloads for the same asset', async () => {
  await withCache(async (cacheDir) => {
    let calls = 0;
    const transport = new CachedBinaryHttpTransport({
      cacheDir,
      upstream: {
        async getArrayBuffer() {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { status: 200, headers: new Headers(), body: new Uint8Array([1, 2]) };
        },
      },
    });
    const url = 'https://example.test/large.img';
    const [a, b] = await Promise.all([
      transport.getArrayBuffer(url, { expectedByteLength: 2 }),
      transport.getArrayBuffer(url, { expectedByteLength: 2 }),
    ]);
    assert.equal(calls, 1);
    assert.equal(a, b);
  });
});

test('requires an explicit cache directory', () => {
  assert.throws(() => new CachedBinaryHttpTransport({ cacheDir: ' ' }), TypeError);
});
