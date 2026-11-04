import assert from 'node:assert/strict';
import test from 'node:test';
import { HiPSNodeService, parseHiPSList, parseHiPSMetadata, parseHiPSProperties } from '../lib-esm/astronomy/hips/index.js';
import { ServiceError } from '../lib-esm/index.js';

const list = `# example
hips_service_url = https://survey.example/hips
creator_did = ivo://example/a
hips_release_date = 2024-01-01
obs_title = A=B

hips_service_url = http://other.example/hips
obs_title = Other
`;

test('metadata parser preserves equals, unknown keys, and comments', () => {
  assert.deepEqual(parseHiPSMetadata(' # note\nfoo = a=b=c\ncustom= value\n'), {foo:'a=b=c', custom:'value'});
});
test('hipslist parser preserves both records and raw metadata', () => {
  const entries = parseHiPSList(list);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].creatorDid, 'ivo://example/a');
  assert.equal(entries[0].releaseDate, '2024-01-01');
  assert.equal(entries[0].metadata.obs_title, 'A=B');
  assert.equal(entries[1].serviceUrl, 'http://other.example/hips');
});
test('properties parser types fields and preserves original metadata', () => {
  const p = parseHiPSProperties('hips_order=7\nhips_tile_format=jpeg png\nhips_frame=equatorial\nobs_title=M51\nextra=a=b', 'https://example.org/hips');
  assert.equal(p.order, 7);
  assert.deepEqual(p.tileFormats, ['jpeg','png']);
  assert.equal(p.frame, 'equatorial');
  assert.equal(p.metadata.extra, 'a=b');
});
test('properties rejects invalid order and empty response', () => {
  assert.throws(() => parseHiPSProperties('hips_order=bad', 'https://example.org'), ServiceError);
  assert.throws(() => parseHiPSProperties('# empty', 'https://example.org'), ServiceError);
});
test('service fetches list and properties using injected transport', async () => {
  const calls=[];
  const service = new HiPSNodeService({timeoutMs: 1234, transport: {getText: async (url, opts) => {
    calls.push({url,opts}); return url.endsWith('hipslist') ? list : 'hips_order=3\nobs_title=M51';
  }}});
  assert.equal((await service.listSurveys('https://node.example/')).length, 2);
  assert.equal((await service.getProperties('https://survey.example/hips/')).order, 3);
  assert.deepEqual(calls.map(c=>c.url), ['https://node.example/hipslist','https://survey.example/hips/properties']);
  assert.equal(calls[0].opts.timeoutMs, 1234);
});
test('service accepts full hipslist/properties URLs and preserves HTTP', async () => {
  const urls=[];
  const service=new HiPSNodeService({transport:{getText:async url=>{urls.push(url);return url.endsWith('hipslist')?'':'hips_order=1';}}});
  assert.deepEqual(await service.listSurveys('http://node.example/hipslist'), []);
  await service.getProperties('http://node.example/hips/properties');
  assert.deepEqual(urls,['http://node.example/hipslist','http://node.example/hips/properties']);
});
test('service rejects unsupported schemes and invalid nonempty lists', async () => {
  const service=new HiPSNodeService({transport:{getText:async()=>'<html>error</html>'}});
  await assert.rejects(service.listSurveys('https://node.example'), e=>e instanceof ServiceError && e.code==='INVALID_RESPONSE');
  await assert.rejects(service.listSurveys('file:///tmp/hipslist'), TypeError);
});
test('service propagates abort signal and transport failures', async () => {
  const controller=new AbortController();
  const service=new HiPSNodeService({transport:{getText:async(_url,opts)=>{assert.equal(opts.signal,controller.signal);throw new ServiceError('NETWORK','offline');}}});
  await assert.rejects(service.getProperties('https://node.example', {signal:controller.signal}), e=>e.code==='NETWORK');
});
