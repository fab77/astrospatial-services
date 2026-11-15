import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FirmsService,
  parseFirmsCsv,
} from '../lib-esm/earth/wildfire/index.js';

const response = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-12.34567,18.76543,345.12,0.42,0.38,2026-08-27,0835,N21,VIIRS,h,2.0NRT,301.22,18.64,D
-13.10000,19.20000,331.50,0.50,0.44,2026-08-27,43,N20,VIIRS,n,2.0NRT,298.10,7.25,N`;

test('parses FIRMS VIIRS detections and normalises scientific metadata', () => {
  const detections = parseFirmsCsv(response, 'VIIRS_NOAA21_NRT');
  assert.equal(detections.length, 2);
  assert.deepEqual(detections[0], {
    id: 'N21:VIIRS:2026-08-27T08:35:00Z:-12.34567:18.76543',
    longitudeDeg: 18.76543,
    latitudeDeg: -12.34567,
    acquiredAt: '2026-08-27T08:35:00Z',
    satellite: 'N21',
    instrument: 'VIIRS',
    confidence: 'high',
    fireRadiativePowerMw: 18.64,
    brightnessKelvin: 345.12,
    secondaryBrightnessKelvin: 301.22,
    scanKm: 0.42,
    trackKm: 0.38,
    dayNight: 'day',
    version: '2.0NRT',
    source: 'VIIRS_NOAA21_NRT',
    provider: 'NASA FIRMS',
  });
  assert.equal(detections[1].acquiredAt, '2026-08-27T00:43:00Z');
  assert.equal(detections[1].confidence, 'nominal');
  assert.equal(detections[1].dayNight, 'night');
});

test('skips invalid FIRMS rows and rejects missing required columns', () => {
  const invalidCoordinate = response.replace('-12.34567,18.76543', '200,18.76543');
  assert.equal(parseFirmsCsv(invalidCoordinate, 'VIIRS_NOAA21_NRT').length, 1);
  assert.throws(
    () => parseFirmsCsv('latitude,longitude\n1,2', 'VIIRS_NOAA21_NRT'),
    { code: 'INVALID_RESPONSE' },
  );
});

test('builds an authenticated NASA FIRMS area request', async () => {
  let request;
  const service = new FirmsService({
    authentication: { kind: 'map-key', mapKey: 'test-map-key' },
    transport: {
      async getText(url, options) {
        request = { url, options };
        return response;
      },
    },
  });
  const controller = new AbortController();
  const result = await service.queryArea({
    source: 'VIIRS_NOAA21_NRT',
    area: { west: -18, south: -35, east: 52, north: 38 },
    dayRange: 5,
    startDate: '2026-08-25',
    signal: controller.signal,
  });
  const url = new URL(request.url);
  assert.equal(
    url.pathname,
    '/api/area/csv/test-map-key/VIIRS_NOAA21_NRT/-18,-35,52,38/5/2026-08-25',
  );
  assert.equal(request.options.signal, controller.signal);
  assert.equal(request.options.timeoutMs, 30000);
  assert.equal(result.detections.length, 2);
  assert.equal(result.provider, 'NASA FIRMS');
});

test('redacts path credentials from transport errors', async () => {
  const service = new FirmsService({
    authentication: { kind: 'map-key', mapKey: 'secret-map-key' },
    transport: {
      async getText(url) {
        throw new Error(`provider failed for ${url}`);
      },
    },
  });
  await assert.rejects(
    service.queryArea({
      source: 'VIIRS_NOAA21_NRT',
      area: 'world',
      dayRange: 1,
    }),
    (error) => {
      assert.doesNotMatch(error.message, /secret-map-key/);
      return true;
    },
  );
});

test('supports a keyless relay endpoint for browser applications', async () => {
  let requestUrl;
  const service = new FirmsService({
    authentication: { kind: 'relay' },
    endpoint: 'https://relay.example.test/api/firms/',
    transport: {
      async getText(url) {
        requestUrl = url;
        return response;
      },
    },
  });
  await service.queryArea({
    source: 'VIIRS_NOAA20_NRT',
    area: 'world',
    dayRange: 1,
  });
  assert.equal(
    new URL(requestUrl).pathname,
    '/api/firms/VIIRS_NOAA20_NRT/world/1',
  );
});

test('validates FIRMS credentials, dates, day range and bounding boxes', async () => {
  assert.throws(
    () => new FirmsService({ authentication: { kind: 'map-key', mapKey: ' ' } }),
    TypeError,
  );
  assert.throws(
    () => new FirmsService({ authentication: { kind: 'relay' } }),
    TypeError,
  );
  const service = new FirmsService({
    authentication: { kind: 'map-key', mapKey: 'test' },
  });
  await assert.rejects(
    service.queryArea({ source: 'VIIRS_NOAA21_NRT', area: 'world', dayRange: 6 }),
    RangeError,
  );
  await assert.rejects(
    service.queryArea({
      source: 'VIIRS_NOAA21_NRT',
      area: 'world',
      dayRange: 1,
      startDate: '2026-02-30',
    }),
    TypeError,
  );
  await assert.rejects(
    service.queryArea({
      source: 'VIIRS_NOAA21_NRT',
      area: { west: 20, south: -35, east: -20, north: 38 },
      dayRange: 1,
    }),
    RangeError,
  );
});
