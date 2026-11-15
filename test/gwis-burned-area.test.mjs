import assert from 'node:assert/strict';
import test from 'node:test';
import { GwisBurnedAreaService } from '../lib-esm/earth/wildfire/index.js';

const response = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'nrt.ba.poly.15765283',
    properties: {
      id: '15765283',
      fire_id: '15765283',
      initialdate: '2026-08-27 12:59:00',
      finaldate: '2026-08-30 13:23:00',
      area: '435',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [18.84095, -11.2542],
        [18.8501, -11.2542],
        [18.8501, -11.245],
        [18.84095, -11.2542],
      ]],
    },
  }],
});

test('queries GWIS with server-side spatial, temporal and area filters', async () => {
  let request;
  const service = new GwisBurnedAreaService({
    transport: {
      async getText(url, options) {
        request = { url, options };
        return response;
      },
    },
  });
  const controller = new AbortController();
  const result = await service.queryPerimeters({
    area: { west: 11, south: -18, east: 25, north: -4 },
    startDate: '2026-08-25',
    endDate: '2026-08-29',
    minAreaHa: 200,
    signal: controller.signal,
  });

  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://maps.effis.emergency.copernicus.eu/gwis');
  assert.equal(url.searchParams.get('typeName'), 'ms:nrt.ba.poly');
  assert.equal(url.searchParams.get('outputFormat'), 'application/json; subtype=geojson');
  const filter = url.searchParams.get('FILTER');
  assert.match(filter, /<gml:lowerCorner>-18 11<\/gml:lowerCorner>/);
  assert.match(filter, /<gml:upperCorner>-4 25<\/gml:upperCorner>/);
  assert.match(filter, /2026-08-25 00:00:00/);
  assert.match(filter, /2026-08-29 23:59:59/);
  assert.match(filter, /<ogc:PropertyName>area<\/ogc:PropertyName><ogc:Literal>200<\/ogc:Literal>/);
  assert.equal(request.options.signal, controller.signal);
  assert.equal(request.options.timeoutMs, 60000);

  assert.deepEqual(result.perimeters[0], {
    id: '15765283',
    fireId: '15765283',
    initialAt: '2026-08-27T12:59:00.000Z',
    finalAt: '2026-08-30T13:23:00.000Z',
    areaHa: 435,
    geometry: JSON.parse(response).features[0].geometry,
    product: 'MODIS & VIIRS NRT',
    provider: 'Copernicus GWIS',
  });
  assert.equal(result.provider, 'Copernicus GWIS');
});

test('validates GWIS queries before making a request', async () => {
  const service = new GwisBurnedAreaService();
  await assert.rejects(
    service.queryPerimeters({
      area: { west: 25, south: -18, east: 11, north: -4 },
      startDate: '2026-08-25',
      endDate: '2026-08-29',
    }),
    RangeError,
  );
  await assert.rejects(
    service.queryPerimeters({
      area: { west: 11, south: -18, east: 25, north: -4 },
      startDate: '2026-08-30',
      endDate: '2026-08-29',
    }),
    RangeError,
  );
  await assert.rejects(
    service.queryPerimeters({
      area: { west: 11, south: -18, east: 25, north: -4 },
      startDate: '2026-02-30',
      endDate: '2026-08-29',
    }),
    TypeError,
  );
});

test('rejects malformed GWIS GeoJSON', async () => {
  const service = new GwisBurnedAreaService({
    transport: { async getText() { return '{"type":"FeatureCollection","features":[{}]}'; } },
  });
  await assert.rejects(
    service.queryPerimeters({
      area: { west: 11, south: -18, east: 25, north: -4 },
      startDate: '2026-08-25',
      endDate: '2026-08-29',
    }),
    { code: 'INVALID_RESPONSE' },
  );
});
