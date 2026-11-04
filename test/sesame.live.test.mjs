import assert from 'node:assert/strict';
import test from 'node:test';
import { SesameService } from '../lib-esm/index.js';

test('CDS Sesame resolves M51 (opt-in live test)', { skip: process.env.RUN_LIVE_TESTS !== '1' }, async () => {
  const result = await new SesameService().resolve('M51');
  assert.ok(result);
  assert.ok(Math.abs(result.raDeg - 202.47) < 0.1);
  assert.ok(Math.abs(result.decDeg - 47.195) < 0.1);
});
