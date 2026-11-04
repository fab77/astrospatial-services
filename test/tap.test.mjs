import assert from 'node:assert/strict';
import test from 'node:test';
import { TapService } from '../lib-esm/astronomy/tap/index.js';
import { ServiceError } from '../lib-esm/index.js';

test('TAP Sync posts ADQL form and returns unmodified response', async () => {
  let sent;
  const tap = new TapService({
    endpoint: 'https://archive.example/tap/',
    transport: { getText: async () => { throw Error('unexpected GET'); }, request: async (url, options) => {
      sent = { url, options };
      return { status: 200, headers: new Headers({ 'content-type': 'text/csv' }), body: 'ra,dec\n1,2\n' };
    } },
  });
  const result = await tap.querySync({ adql: 'SELECT TOP 1 ra, dec FROM foo', format: 'csv', maxrec: 20 });
  assert.equal(sent.url, 'https://archive.example/tap/sync');
  assert.equal(sent.options.method, 'POST');
  assert.match(sent.options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(sent.options.body)), {
    REQUEST: 'doQuery', LANG: 'ADQL', QUERY: 'SELECT TOP 1 ra, dec FROM foo', FORMAT: 'csv', MAXREC: '20',
  });
  assert.equal(result.body, 'ra,dec\n1,2\n');
  assert.equal(result.contentType, 'text/csv');
});

test('accepts existing sync endpoint and passes cancellation and timeout', async () => {
  const controller = new AbortController();
  let captured;
  const tap = new TapService({ endpoint: 'https://archive.example/tap/sync', timeoutMs: 1500, transport: {
    getText: async () => '', request: async (url, options) => {
      captured = { url, options };
      return { status: 200, headers: new Headers(), body: '<VOTABLE />' };
    },
  } });
  await tap.querySync({ adql: 'SELECT * FROM t', signal: controller.signal });
  assert.equal(captured.url, 'https://archive.example/tap/sync');
  assert.equal(captured.options.signal, controller.signal);
  assert.equal(captured.options.timeoutMs, 1500);
  assert.equal(new URLSearchParams(captured.options.body).get('FORMAT'), 'votable');
});

test('rejects invalid endpoint, blank ADQL and invalid maxrec', async () => {
  assert.throws(() => new TapService({ endpoint: 'file:///tmp/tap' }), TypeError);
  assert.throws(() => new TapService({ endpoint: 'https://u:p@host/tap' }), TypeError);
  assert.throws(() => new TapService({ endpoint: 'https://host/tap?x=1' }), TypeError);
  const tap = new TapService({ endpoint: 'https://host/tap' });
  await assert.rejects(tap.querySync({ adql: '  ' }), TypeError);
  await assert.rejects(tap.querySync({ adql: 'SELECT 1', maxrec: -1 }), RangeError);
});

test('requires POST-capable transport', async () => {
  const tap = new TapService({ endpoint: 'https://host/tap', transport: { getText: async () => '' } });
  await assert.rejects(tap.querySync({ adql: 'SELECT 1' }), error => error instanceof ServiceError && error.code === 'INVALID_RESPONSE');
});

test('propagates transport errors without converting them', async () => {
  const failure = new ServiceError('TIMEOUT', 'timeout');
  const tap = new TapService({ endpoint: 'https://host/tap', transport: {
    getText: async () => '', request: async () => { throw failure; },
  } });
  await assert.rejects(tap.querySync({ adql: 'SELECT 1' }), error => error === failure);
});

test('metadata API reads capabilities and queries TAP_SCHEMA via POST', async () => {
  const calls = [];
  const transport = {
    getText: async (url, opts) => { calls.push({url, opts}); return '<capabilities />'; },
    request: async (url, opts) => {
      const adql = new URLSearchParams(opts.body).get('QUERY');
      calls.push({url, opts, adql});
      const body = adql.includes('TAP_SCHEMA.schemas') ? 'schema_name,description,utype\nobservations,"A, B",\n' :
        adql.includes('TAP_SCHEMA.tables') ? 'schema_name,table_name,table_type,description,utype\nobservations,observations.test,table,"two\nlines",\n' :
        'table_name,column_name,description,unit,ucd,utype,datatype,arraysize,xtype,principal,indexed,std\nobservations.test,ra,Right ascension,deg,pos.eq.ra,,DOUBLE,,,,1,1\n';
      return {status:200, headers:new Headers({'content-type':'text/csv'}), body};
    },
  };
  const tap = new TapService({endpoint:'https://example.org/tap/sync',transport,timeoutMs:4000});
  assert.equal(await tap.getCapabilities(), '<capabilities />');
  assert.equal(calls[0].url, 'https://example.org/tap/capabilities');
  assert.equal(calls[0].opts.timeoutMs, 4000);
  assert.deepEqual(await tap.listSchemas(), [{schema_name:'observations',description:'A, B',utype:''}]);
  const tables = await tap.listTables({schemaName:"obser'vations"});
  assert.equal(tables[0].description, 'two\nlines');
  assert.match(calls[2].adql, /WHERE schema_name = 'obser''vations'/);
  const columns = await tap.listColumns('observations.test');
  assert.equal(columns[0].column_name, 'ra');
  assert.equal(columns[0].datatype, 'DOUBLE');
  assert.match(calls[3].adql, /WHERE table_name = 'observations.test'/);
});

test('metadata CSV parser handles quoting and rejects malformed data', async () => {
  const {parseTapCsv} = await import('../lib-esm/astronomy/tap/index.js');
  assert.deepEqual(parseTapCsv('name,description\r\nx,"a ""quote"", here"\r\n'),
    [{name:'x',description:'a "quote", here'}]);
  assert.throws(() => parseTapCsv('name,description\nx,"unterminated'), error => error.code === 'INVALID_RESPONSE');
  assert.throws(() => parseTapCsv('name,description\nx\n'), error => error.code === 'INVALID_RESPONSE');
  const tap = new TapService({endpoint:'https://example.org/tap',transport:{
    getText:async()=>'', request:async()=>({status:200,headers:new Headers({'content-type':'application/xml'}),body:'<VOTABLE />'})
  }});
  await assert.rejects(tap.listSchemas(), error => error.code === 'INVALID_RESPONSE');
  await assert.rejects(tap.listColumns(' '), TypeError);
});

test('TAP CSV table preserves headers and row values', async () => {
  const { parseTapCsvTable } =
    await import('../lib-esm/astronomy/tap/index.js');

  const table = parseTapCsvTable(
    'ra,dec,name\n12.5,-3.2,"M51, Whirlpool"\n',
  );

  assert.deepEqual(table.columns, ['ra', 'dec', 'name']);
  assert.deepEqual(table.rows, [
    { ra: '12.5', dec: '-3.2', name: 'M51, Whirlpool' },
  ]);
});

test('TAP CSV table preserves headers when no rows are returned', async () => {
  const { parseTapCsvTable, parseTapCsv } =
    await import('../lib-esm/astronomy/tap/index.js');

  const csv = 'ra,dec,source_id\n';

  assert.deepEqual(parseTapCsvTable(csv), {
    columns: ['ra', 'dec', 'source_id'],
    rows: [],
  });

  assert.deepEqual(parseTapCsv(csv), []);
});

test('TAP CSV table handles BOM and quoted headers', async () => {
  const { parseTapCsvTable } =
    await import('../lib-esm/astronomy/tap/index.js');

  const table = parseTapCsvTable(
    '\uFEFF"right ascension",dec\r\n12.5,-3.2\r\n',
  );

  assert.deepEqual(table.columns, ['right ascension', 'dec']);
  assert.deepEqual(table.rows, [
    { 'right ascension': '12.5', dec: '-3.2' },
  ]);
});
