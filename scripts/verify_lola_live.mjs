import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import {
  OFFICIAL_ELEVATION_PRODUCTS,
  PlanetaryElevationService,
} from '../lib-esm/index.js';
import {
  CachedBinaryHttpTransport,
  binaryCachePath,
} from '../lib-esm/planetary/node/index.js';

const product = OFFICIAL_ELEVATION_PRODUCTS.moonLolaLdem64;
const cacheDir = path.resolve(process.env.PLANETARY_CACHE_DIR ?? '.cache/planetary');
const cachePath = binaryCachePath(cacheDir, product.assets.dataUrl);

console.log(`LOLA product: ${product.id}`);
console.log(`Cache directory: ${cacheDir}`);
console.log(`Expected download: ${product.assets.byteLength} bytes`);

const service = new PlanetaryElevationService({
  timeoutMs: 30 * 60 * 1000,
  binaryTransport: new CachedBinaryHttpTransport({ cacheDir }),
});

const startedAt = Date.now();
const { decoded } = await service.load(product.id);
console.log(`Loaded in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);

assert.equal(decoded.width, 23040);
assert.equal(decoded.height, 11520);
assert.equal(decoded.field.metadata.sourceProductId, 'LDEM_64.IMG');
assert.equal(decoded.field.metadata.referenceRadiusM, 1_737_400);

const points = [
  ['north-pole', 0, 0],
  ['mid-north', Math.PI / 4, Math.PI / 3],
  ['equator-prime', Math.PI / 2, 0],
  ['equator-90e', Math.PI / 2, Math.PI / 2],
  ['equator-180e', Math.PI / 2, Math.PI],
  ['mid-south', 3 * Math.PI / 4, 5 * Math.PI / 3],
  ['south-pole', Math.PI, 0],
];

for (const [name, theta, phi] of points) {
  const sample = decoded.field.sampleDirection(theta, phi);
  assert.equal(sample.valid, true, `${name} must contain a valid sample`);
  assert.ok(sample.elevationM >= -9_125.5 && sample.elevationM <= 10_773, `${name} elevation outside label range`);
  assert.equal(sample.radiusM, 1_737_400 + sample.elevationM);
  console.log(`${name}: elevation=${sample.elevationM.toFixed(3)} m radius=${sample.radiusM.toFixed(3)} m`);
}

const seamWest = decoded.field.sampleDirection(Math.PI / 2, 0);
const seamEast = decoded.field.sampleDirection(Math.PI / 2, 2 * Math.PI);
assert.deepEqual(seamEast, seamWest);
console.log('Longitude seam 0/360: exact match');

const hash = createHash('sha256');
await pipeline(
  createReadStream(cachePath),
  new Writable({
    write(chunk, _encoding, callback) {
      hash.update(chunk);
      callback();
    },
  }),
);
const sha256 = hash.digest('hex');
console.log(`SHA-256: ${sha256}`);
const expectedSha256 = process.env.LOLA_LDEM_64_SHA256 ?? product.metadata.checksum;
assert.equal(sha256, expectedSha256.toLowerCase());
console.log('SHA-256 matches the curated product catalog');

console.log('LOLA live verification passed');
