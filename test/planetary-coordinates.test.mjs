import assert from 'node:assert/strict';
import test from 'node:test';
import {
  healpixDirectionToCanonical,
  normalizeEastLongitudeRad,
} from '../lib-esm/planetary/elevation/index.js';

test('converts HEALPix theta/phi to canonical planetocentric coordinates', () => {
  assert.deepEqual(healpixDirectionToCanonical(0, 0), {
    latitudeRad: Math.PI / 2,
    longitudeRad: 0,
  });
  assert.deepEqual(healpixDirectionToCanonical(Math.PI / 2, 2 * Math.PI), {
    latitudeRad: 0,
    longitudeRad: 0,
  });
  assert.equal(healpixDirectionToCanonical(Math.PI, -Math.PI / 2).longitudeRad, 3 * Math.PI / 2);
});

test('normalizes east-positive longitude and rejects invalid angles', () => {
  assert.equal(normalizeEastLongitudeRad(-0.25), 2 * Math.PI - 0.25);
  assert.throws(() => normalizeEastLongitudeRad(Number.NaN), RangeError);
  assert.throws(() => healpixDirectionToCanonical(-0.1, 0), RangeError);
  assert.throws(() => healpixDirectionToCanonical(Math.PI + 0.1, 0), RangeError);
});
