import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NominatimService,
  parseNominatimSearchResponse,
} from '../lib-esm/index.js';

const response = JSON.stringify([
  {
    place_id: 123,
    display_name: 'Gran Vía, Centro, Madrid, Spain',
    lon: '-3.7037902',
    lat: '40.4200101',
    class: 'highway',
    type: 'primary',
    importance: 0.72,
    boundingbox: ['40.419', '40.421', '-3.705', '-3.702'],
    address: {
      road: 'Gran Vía',
      city: 'Madrid',
      country: 'España',
      country_code: 'es',
    },
  },
]);

test('parses Nominatim place, address and geographic metadata', () => {
  assert.deepEqual(parseNominatimSearchResponse(response), [{
    id: '123',
    label: 'Gran Vía, Centro, Madrid, Spain',
    longitudeDeg: -3.7037902,
    latitudeDeg: 40.4200101,
    type: 'primary',
    category: 'highway',
    importance: 0.72,
    boundingBox: [40.419, 40.421, -3.705, -3.702],
    address: {
      road: 'Gran Vía',
      city: 'Madrid',
      country: 'España',
      country_code: 'es',
    },
    provider: 'Nominatim',
  }]);
});

test('ignores invalid records but rejects a malformed response root', () => {
  assert.deepEqual(parseNominatimSearchResponse('[{"lat":"200","lon":"0"},null]'), []);
  assert.throws(() => parseNominatimSearchResponse('{"error":"down"}'), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseNominatimSearchResponse('<html>down</html>'), { code: 'INVALID_RESPONSE' });
});

test('builds a compliant search request and retains caller cancellation', async () => {
  let request;
  const service = new NominatimService({
    endpoint: 'https://geocoder.example/api/',
    userAgent: 'AstroBrowser test contact@example.test',
    email: 'contact@example.test',
    transport: {
      async getText() { throw new Error('request() should be used'); },
      async request(url, options) {
        request = { url, options };
        return { status: 200, headers: new Headers(), body: response };
      },
    },
  });
  const controller = new AbortController();
  const places = await service.search('  Gran Vía Madrid  ', {
    limit: 4,
    signal: controller.signal,
  });
  const url = new URL(request.url);
  assert.equal(url.pathname, '/api/search');
  assert.equal(url.searchParams.get('q'), 'Gran Vía Madrid');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('addressdetails'), '1');
  assert.equal(url.searchParams.get('limit'), '4');
  assert.equal(url.searchParams.get('email'), 'contact@example.test');
  assert.equal(request.options.headers['User-Agent'], 'AstroBrowser test contact@example.test');
  assert.equal(request.options.signal, controller.signal);
  assert.equal(places[0].category, 'highway');
});

test('supports a transport with only getText', async () => {
  const service = new NominatimService({
    userAgent: 'Test application',
    transport: {
      async getText(url, options) {
        assert.match(url, /\/search\?/);
        assert.equal(options.timeoutMs, 10000);
        return '[]';
      },
    },
  });
  assert.deepEqual(await service.search('Rome'), []);
});

test('validates application identity, query and limit', async () => {
  assert.throws(() => new NominatimService({ userAgent: ' ' }), TypeError);
  const service = new NominatimService({ userAgent: 'Test application' });
  await assert.rejects(service.search('ab'), TypeError);
  await assert.rejects(service.search('Madrid', { limit: 11 }), RangeError);
});
