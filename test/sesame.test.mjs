import assert from 'node:assert/strict';
import test from 'node:test';
import { SesameService, parseSesameXml, FetchHttpTransport, ServiceError } from '../lib-esm/index.js';

const xml = `<?xml version="1.0"?><Sesame><Target name="M51"><Resolver name="Simbad"><jradeg>202.469575</jradeg><jdedeg>47.195258</jdedeg></Resolver></Target></Sesame>`;
test('parses legacy Sesame XML coordinates and resolver', () => {
  assert.deepEqual(parseSesameXml(xml, 'M51'), { name: 'M51', raDeg: 202.469575, decDeg: 47.195258, resolver: 'Simbad' });
});
test('returns null for unresolved target', () => {
  assert.equal(parseSesameXml('<Sesame><Target name="unknown"/></Sesame>', 'unknown'), null);
});
test('rejects malformed response', () => {
  assert.throws(() => parseSesameXml('<html>error</html>', 'M51'), { code: 'INVALID_RESPONSE' });
});
test('rejects out-of-range coordinates', () => {
  assert.equal(parseSesameXml(xml.replace('47.195258', '100.0'), 'M51'), null);
});
test('encodes names and uses injected transport', async () => {
  let request;
  const service = new SesameService({ transport: { async getText(url, options) { request = { url, options }; return xml; } } });
  assert.equal((await service.resolve('  M 51  ')).raDeg, 202.469575);
  assert.match(request.url, /M%2051$/);
  assert.equal(request.options.timeoutMs, 10000);
});
test('propagates HTTP errors', async () => {
  const transport = new FetchHttpTransport(async () => new Response('down', { status: 503 }));
  await assert.rejects(transport.getText('https://example.org'), { code: 'HTTP', status: 503 });
});
test('propagates caller cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const transport = new FetchHttpTransport(async (_url, { signal }) => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); return new Response('ok'); });
  await assert.rejects(transport.getText('https://example.org', { signal: controller.signal }), { code: 'ABORTED' });
});
test('rejects blank target', async () => {
  await assert.rejects(new SesameService().resolve(' '), TypeError);
});
