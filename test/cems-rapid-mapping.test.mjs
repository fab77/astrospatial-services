import assert from 'node:assert/strict';
import test from 'node:test';
import { CemsRapidMappingService } from '../lib-esm/earth/emergency/index.js';

const activationResponse = JSON.stringify({
  count: 1,
  results: [{
    code: 'EMSR868',
    name: 'Flood in Evros River basin, Greece',
    category: 'Flood',
    subCategory: 'Riverine flood',
    eventTime: '2026-02-18T22:00:00',
    activationTime: '2026-02-19T10:00:00',
    countries: [{ name: 'Greece' }],
    reason: 'Flood extent and damage assessment mapping.',
    aois: [{
      number: 2,
      name: 'Feres',
      extent: 'POLYGON ((26.0 40.0, 26.1 40.0, 26.0 40.0))',
      products: [{
        id: 2505,
        type: 'DEL',
        monitoringNumber: 3,
        images: [{ acquisitionTime: '2026-02-27T16:14:00' }],
        stats: { 'Flooded area': { None: { unit: 'ha', affected: 10056.9 } } },
        version: { deliveryTime: '2026-02-27T21:10:00' },
        layers: [{
          name: 'EMSR868/AOI02/DEL_MONIT03/example_observedEventA_v1_VT',
          json: 'https://example.test/observed.json',
        }, {
          name: 'EMSR868/AOI02/DEL_MONIT03/example_maximumFloodExtentA_v1_VT',
          json: 'https://example.test/maximum.json',
        }],
        downloadPath: 'https://example.test/product.zip',
      }],
    }],
  }],
});

const geoJsonResponse = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 5,
    properties: {
      event_type: '5-Flood',
      obj_desc: 'Riverine flood',
      notation: 'Flooded area',
      area: 1.666168,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[[26.01, 40.85], [26.02, 40.85], [26.01, 40.85]]],
    },
  }],
});

test('normalises a public CEMS Rapid Mapping activation', async () => {
  let requestedUrl;
  const service = new CemsRapidMappingService({
    transport: {
      async getText(url) {
        requestedUrl = url;
        return activationResponse;
      },
    },
  });

  const activation = await service.getActivation('emsr868');
  assert.equal(new URL(requestedUrl).searchParams.get('code'), 'EMSR868');
  assert.equal(activation.provider, 'Copernicus EMS Rapid Mapping');
  assert.deepEqual(activation.countries, ['Greece']);
  assert.equal(activation.areas[0].name, 'Feres');
  assert.deepEqual(
    activation.areas[0].products[0].layers.map((layer) => layer.kind),
    ['observed-event', 'maximum-flood-extent'],
  );
  assert.equal(activation.areas[0].products[0].acquiredAt, '2026-02-27T16:14:00.000Z');
});

test('resolves and downloads a CEMS flood layer', async () => {
  const requests = [];
  const service = new CemsRapidMappingService({
    transport: {
      async getText(url) {
        requests.push(url);
        return url === 'https://example.test/observed.json'
          ? geoJsonResponse
          : activationResponse;
      },
    },
  });

  const result = await service.queryFloodLayer({
    activationCode: 'EMSR868',
    areaNumber: 2,
    monitoringNumber: 3,
    kind: 'observed-event',
  });

  assert.equal(requests[1], 'https://example.test/observed.json');
  assert.equal(result.areaName, 'Feres');
  assert.equal(result.acquiredAt, '2026-02-27T16:14:00.000Z');
  assert.equal(result.data.features.length, 1);
  assert.equal(result.data.features[0].properties.notation, 'Flooded area');
  assert.equal(result.provider, 'Copernicus EMS Rapid Mapping');
});

test('validates identifiers and missing CEMS layers', async () => {
  const service = new CemsRapidMappingService({
    transport: { async getText() { return activationResponse; } },
  });
  await assert.rejects(service.getActivation('868'), TypeError);
  await assert.rejects(
    service.queryFloodLayer({
      activationCode: 'EMSR868',
      areaNumber: 0,
      monitoringNumber: 3,
      kind: 'observed-event',
    }),
    RangeError,
  );
  await assert.rejects(
    service.queryFloodLayer({
      activationCode: 'EMSR868',
      areaNumber: 2,
      monitoringNumber: 2,
      kind: 'observed-event',
    }),
    { code: 'INVALID_RESPONSE' },
  );
});

test('rejects malformed CEMS GeoJSON', async () => {
  const service = new CemsRapidMappingService({
    transport: {
      async getText(url) {
        return url === 'https://example.test/observed.json'
          ? '{"type":"FeatureCollection","features":[{}]}'
          : activationResponse;
      },
    },
  });
  await assert.rejects(
    service.queryFloodLayer({
      activationCode: 'EMSR868',
      areaNumber: 2,
      monitoringNumber: 3,
      kind: 'observed-event',
    }),
    { code: 'INVALID_RESPONSE' },
  );
});
