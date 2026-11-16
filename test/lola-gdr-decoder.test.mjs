import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeLolaGdr,
  parsePds3Label,
  ServiceError,
} from '../lib-esm/index.js';

const label = `PDS_VERSION_ID = "PDS3"
PRODUCT_VERSION_ID = "V3.1"
DATA_SET_ID = "LRO-L-LOLA-4-GDR-V1.0"
PRODUCT_ID = "LDEM_TEST"
FILE_NAME = "LDEM_TEST.IMG"
LINES = 2
LINE_SAMPLES = 4
SAMPLE_TYPE = LSB_INTEGER
SAMPLE_BITS = 16
SCALING_FACTOR = 0.5
OFFSET = 1737400. <m>
MAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
MAXIMUM_LATITUDE = 90 <deg>
MINIMUM_LATITUDE = -90 <deg>
WESTERNMOST_LONGITUDE = 0 <deg>
EASTERNMOST_LONGITUDE = 360 <deg>
COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
END
`;

function image(values) {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return buffer;
}

test('parses scalar PDS3 values, quoted strings and units', () => {
  const parsed = parsePds3Label(label);
  assert.equal(parsed.PRODUCT_ID, 'LDEM_TEST');
  assert.equal(parsed.OFFSET, 1737400);
  assert.equal(parsed.SAMPLE_BITS, 16);
});

test('decodes little-endian LOLA DN lazily into elevation and radius', () => {
  const decoded = decodeLolaGdr(label, image([
    0, 20, 40, 60,
    -20, -40, -60, -80,
  ]), { sourceUrl: 'https://example.test/ldem_test.img' });
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.field.metadata.frame, 'MEAN EARTH/POLAR AXIS OF DE421');
  assert.equal(decoded.field.metadata.sourceUrl, 'https://example.test/ldem_test.img');
  assert.deepEqual(
    decoded.field.sampleDirection(Math.PI / 4, Math.PI / 4, { interpolation: 'nearest' }),
    { valid: true, elevationM: 0, radiusM: 1737400 },
  );
  assert.deepEqual(
    decoded.field.sampleDirection(3 * Math.PI / 4, Math.PI / 4, { interpolation: 'nearest' }),
    { valid: true, elevationM: -10, radiusM: 1737390 },
  );
});

test('supports an ArrayBuffer view without reading bytes outside the view', () => {
  const container = new Uint8Array(4 + 16 + 4);
  const payload = new DataView(container.buffer, 4, 16);
  for (let index = 0; index < 8; index++) payload.setInt16(index * 2, index, true);
  const decoded = decodeLolaGdr(label, new Uint8Array(container.buffer, 4, 16));
  assert.equal(
    decoded.field.sampleDirection(Math.PI / 4, Math.PI / 4, { interpolation: 'nearest' }).elevationM,
    0,
  );
});

test('rejects truncated images and unsupported encodings', () => {
  assert.throws(
    () => decodeLolaGdr(label, new ArrayBuffer(2)),
    (error) => error instanceof ServiceError && error.code === 'INVALID_RESPONSE',
  );
  assert.throws(
    () => decodeLolaGdr(label.replace('LSB_INTEGER', 'MSB_INTEGER'), image(new Array(8).fill(0))),
    (error) => error instanceof ServiceError && error.code === 'NOT_IMPLEMENTED',
  );
});

test('rejects non-PDS3 and incomplete labels', () => {
  assert.throws(() => parsePds3Label('PDS_VERSION_ID = "PDS4"'), ServiceError);
  assert.throws(
    () => decodeLolaGdr(label.replace('LINE_SAMPLES = 4\n', ''), image(new Array(8).fill(0))),
    ServiceError,
  );
});
