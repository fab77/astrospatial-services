import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GridElevationField,
  OFFICIAL_ELEVATION_PRODUCTS,
  getOfficialElevationProduct,
} from '../lib-esm/index.js';

const metadata = {
  body: 'moon',
  frame: 'test body-fixed',
  latitudeType: 'planetocentric',
  longitudeDirection: 'east',
  longitudeDomain: '0_360',
  verticalDatum: 'test sphere',
  verticalUnit: 'm',
  referenceRadiusM: 1000,
  sourceProductId: 'synthetic',
  sourceUrl: 'https://example.test/synthetic',
  version: '1',
  citation: 'Synthetic test field',
};

const globalPixelGrid = {
  westLongitudeRad: 0,
  eastLongitudeRad: 2 * Math.PI,
  northLatitudeRad: Math.PI / 2,
  southLatitudeRad: -Math.PI / 2,
  registration: 'pixel-center',
  periodicLongitude: true,
};

test('samples a global elevation grid and returns elevation and radius', () => {
  const field = new GridElevationField({
    metadata,
    width: 4,
    height: 2,
    values: [10, 20, 30, 40, 50, 60, 70, 80],
    geometry: globalPixelGrid,
    valueType: 'elevation',
    interpolation: 'nearest',
  });
  assert.deepEqual(field.sampleDirection(Math.PI / 4, Math.PI / 4), {
    valid: true,
    elevationM: 10,
    radiusM: 1010,
  });
  assert.deepEqual(field.sampleDirection(3 * Math.PI / 4, Math.PI / 4), {
    valid: true,
    elevationM: 50,
    radiusM: 1050,
  });
});

test('wraps the longitude seam and applies scale and offset', () => {
  const field = new GridElevationField({
    metadata,
    width: 4,
    height: 1,
    values: [1, 2, 3, 4],
    geometry: globalPixelGrid,
    valueType: 'elevation',
    interpolation: 'nearest',
    scale: 10,
    offset: 5,
  });
  assert.equal(field.sampleDirection(Math.PI / 2, 0).elevationM, 15);
  assert.equal(field.sampleDirection(Math.PI / 2, 2 * Math.PI).elevationM, 15);
  assert.equal(field.sampleDirection(Math.PI / 2, -2 * Math.PI).elevationM, 15);
});

test('renormalizes bilinear weights around NoData and reports empty samples', () => {
  const field = new GridElevationField({
    metadata,
    width: 2,
    height: 2,
    values: [-9999, 20, 40, 60],
    geometry: globalPixelGrid,
    valueType: 'elevation',
    noDataValue: -9999,
  });
  const sample = field.sampleDirection(Math.PI / 2, Math.PI / 2);
  assert.equal(sample.valid, true);
  assert.ok(Number.isFinite(sample.elevationM));

  const empty = new GridElevationField({
    metadata,
    width: 1,
    height: 1,
    values: [-9999],
    geometry: globalPixelGrid,
    valueType: 'elevation',
    noDataValue: -9999,
  });
  assert.deepEqual(empty.sampleDirection(Math.PI / 2, 0), { valid: false });
});

test('supports absolute-radius grids and validates construction', () => {
  const field = new GridElevationField({
    metadata,
    width: 1,
    height: 1,
    values: [1025],
    geometry: globalPixelGrid,
    valueType: 'radius',
  });
  assert.deepEqual(field.sampleDirection(Math.PI / 2, 0), {
    valid: true,
    radiusM: 1025,
    elevationM: 25,
  });
  assert.throws(() => new GridElevationField({
    metadata,
    width: 2,
    height: 2,
    values: [1],
    geometry: globalPixelGrid,
    valueType: 'radius',
  }), RangeError);
});

test('bilinearly reconstructs an analytic surface on a grid-node raster', () => {
  const width = 5;
  const height = 3;
  const values = [];
  for (let row = 0; row < height; row++) {
    const latitude = Math.PI / 2 - row * Math.PI / (height - 1);
    for (let column = 0; column < width; column++) {
      const longitude = column * 2 * Math.PI / (width - 1);
      values.push(100 * latitude + 10 * longitude);
    }
  }
  const field = new GridElevationField({
    metadata,
    width,
    height,
    values,
    geometry: {
      ...globalPixelGrid,
      registration: 'grid-node',
      periodicLongitude: false,
    },
    valueType: 'elevation',
  });
  const theta = Math.PI / 3;
  const phi = Math.PI / 4;
  const expected = 100 * (Math.PI / 2 - theta) + 10 * phi;
  assert.ok(Math.abs(field.sampleDirection(theta, phi).elevationM - expected) < 1e-12);
});

test('honours regional coverage instead of silently wrapping or clamping', () => {
  const field = new GridElevationField({
    metadata,
    width: 2,
    height: 2,
    values: [1, 2, 3, 4],
    geometry: {
      westLongitudeRad: 0,
      eastLongitudeRad: Math.PI / 2,
      northLatitudeRad: Math.PI / 4,
      southLatitudeRad: -Math.PI / 4,
      registration: 'grid-node',
      periodicLongitude: false,
    },
    valueType: 'elevation',
  });
  assert.equal(field.sampleDirection(Math.PI / 2, Math.PI / 4).valid, true);
  assert.deepEqual(field.sampleDirection(0, Math.PI / 4), { valid: false });
  assert.deepEqual(field.sampleDirection(Math.PI / 2, Math.PI), { valid: false });
});

test('validates grid geometry and periodic coverage', () => {
  assert.throws(() => new GridElevationField({
    metadata,
    width: 2,
    height: 2,
    values: [1, 2, 3, 4],
    geometry: { ...globalPixelGrid, eastLongitudeRad: Math.PI },
    valueType: 'elevation',
  }), RangeError);
});

test('exposes the curated LOLA product with canonical metadata', () => {
  const product = getOfficialElevationProduct('moon-lro-lola-ldem-64');
  assert.equal(product, OFFICIAL_ELEVATION_PRODUCTS.moonLolaLdem64);
  assert.equal(product.metadata.referenceRadiusM, 1_737_400);
  assert.equal(product.metadata.sourceProductId, 'LDEM_64.IMG');
  assert.equal(product.assets.byteLength, 530_841_600);
  assert.match(product.assets.labelUrl, /ldem_64\.lbl$/);
  assert.match(product.metadata.checksum, /^[a-f0-9]{64}$/);
  assert.equal(product.metadata.longitudeDirection, 'east');
  assert.equal(getOfficialElevationProduct('missing'), undefined);
});
