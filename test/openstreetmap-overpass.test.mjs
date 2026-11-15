import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenStreetMapOverpassService } from '../lib-esm/earth/openstreetmap/index.js';

const overpassResponse = JSON.stringify({
  version: 0.6,
  elements: [
    {
      type: 'node',
      id: 101,
      lat: 41.191,
      lon: 26.301,
      tags: { amenity: 'hospital', name: 'Example health centre' },
    },
    {
      type: 'way',
      id: 202,
      center: { lat: 41.194, lon: 26.305 },
      tags: { bridge: 'yes', highway: 'secondary', name: 'Example bridge' },
    },
  ],
});

test('queries infrastructure with a bounded Overpass POST request', async () => {
  let request;
  const service = new OpenStreetMapOverpassService({
    transport: {
      async getText() { throw new Error('Unexpected GET'); },
      async request(url, options) {
        request = { url, options };
        return { status: 200, headers: new Headers(), body: overpassResponse };
      },
    },
  });

  const result = await service.queryInfrastructure({
    area: { west: 26.27, south: 41.16, east: 26.34, north: 41.23 },
    categories: ['bridge', 'healthcare', 'poi', 'bridge'],
  });

  assert.equal(request.options.method, 'POST');
  const encodedQuery = new URLSearchParams(request.options.body).get('data');
  assert.match(encodedQuery, /nwr\["bridge"\]/);
  assert.match(encodedQuery, /nwr\["building"\]/);
  assert.match(encodedQuery, /41\.16,26\.27,41\.23,26\.34/);
  assert.deepEqual(result.categories, ['bridge', 'healthcare', 'poi']);
  assert.equal(result.features[0].category, 'healthcare');
  assert.equal(result.features[1].category, 'bridge');
  assert.equal(result.features[1].sourceUrl, 'https://www.openstreetmap.org/way/202');
  assert.equal(result.provider, 'OpenStreetMap');
});

test('validates bounding boxes and requested categories', async () => {
  const service = new OpenStreetMapOverpassService({
    transport: { async getText() { return overpassResponse; } },
  });
  await assert.rejects(
    service.queryInfrastructure({
      area: { west: 27, south: 41, east: 26, north: 42 },
      categories: ['bridge'],
    }),
    RangeError,
  );
  await assert.rejects(
    service.queryInfrastructure({
      area: { west: 26, south: 41, east: 27, north: 42 },
      categories: [],
    }),
    TypeError,
  );
});
