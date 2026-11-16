import assert from 'node:assert/strict';
import test from 'node:test';
import { PlanetaryElevationService, ServiceError } from '../lib-esm/index.js';

const label = `PDS_VERSION_ID = "PDS3"
PRODUCT_VERSION_ID = "TEST"
DATA_SET_ID = "TEST-GDR"
PRODUCT_ID = "TINY"
FILE_NAME = "TINY.IMG"
LINES = 2
LINE_SAMPLES = 2
SAMPLE_TYPE = LSB_INTEGER
SAMPLE_BITS = 16
SCALING_FACTOR = 1
OFFSET = 1000 <m>
MAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
MAXIMUM_LATITUDE = 90 <deg>
MINIMUM_LATITUDE = -90 <deg>
WESTERNMOST_LONGITUDE = 0 <deg>
EASTERNMOST_LONGITUDE = 360 <deg>
COORDINATE_SYSTEM_NAME = "TEST FRAME"
END`;

const product = {
  id: 'tiny-lola',
  title: 'Tiny LOLA fixture',
  coverage: 'global',
  pixelScaleM: 1,
  assets: {
    dataUrl: 'https://example.test/tiny.img',
    labelUrl: 'https://example.test/tiny.lbl',
    format: 'PDS3_IMG',
    byteLength: 8,
  },
  metadata: {
    body: 'moon',
    frame: 'TEST FRAME',
    latitudeType: 'planetocentric',
    longitudeDirection: 'east',
    longitudeDomain: '0_360',
    verticalDatum: 'test sphere',
    verticalUnit: 'm',
    referenceRadiusM: 1000,
    sourceProductId: 'TINY.IMG',
    sourceUrl: 'https://example.test/tiny.img',
    version: 'TEST',
    citation: 'Test fixture',
  },
};

function binaryFixture() {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  [10, 20, 30, 40].forEach((value, index) => view.setInt16(index * 2, value, true));
  return buffer;
}

test('acquires catalog label and binary then returns a normalized field', async () => {
  const calls = [];
  const service = new PlanetaryElevationService({
    products: [product],
    timeoutMs: 1234,
    textTransport: {
      async getText(url, options) {
        calls.push({ kind: 'label', url, options });
        return label;
      },
    },
    binaryTransport: {
      async getArrayBuffer(url, options) {
        calls.push({ kind: 'data', url, options });
        return { status: 200, headers: new Headers(), body: binaryFixture() };
      },
    },
  });
  const loaded = await service.load('tiny-lola');
  assert.equal(loaded.product, product);
  assert.equal(loaded.decoded.field.metadata.sourceProductId, 'TINY.IMG');
  assert.equal(calls[0].url, product.assets.labelUrl);
  assert.equal(calls[1].url, product.assets.dataUrl);
  assert.equal(calls[1].options.expectedByteLength, 8);
  assert.equal(calls[1].options.timeoutMs, 1234);
});

test('propagates cancellation and rejects unknown or mismatched products', async () => {
  const controller = new AbortController();
  const service = new PlanetaryElevationService({
    products: [product],
    textTransport: {
      async getText(_url, options) {
        assert.equal(options.signal, controller.signal);
        throw new ServiceError('ABORTED', 'cancelled');
      },
    },
    binaryTransport: { async getArrayBuffer() { throw new Error('not reached'); } },
  });
  await assert.rejects(service.load('missing'), { code: 'NOT_FOUND' });
  await assert.rejects(service.load('tiny-lola', { signal: controller.signal }), { code: 'ABORTED' });

  const mismatch = {
    ...product,
    metadata: { ...product.metadata, sourceProductId: 'OTHER.IMG' },
  };
  const mismatchService = new PlanetaryElevationService({
    products: [mismatch],
    textTransport: { async getText() { return label; } },
    binaryTransport: {
      async getArrayBuffer() {
        return { status: 200, headers: new Headers(), body: binaryFixture() };
      },
    },
  });
  await assert.rejects(mismatchService.load('tiny-lola'), { code: 'INVALID_RESPONSE' });
});
