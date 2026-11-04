import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVOTable } from '../lib-esm/astronomy/tap/index.js';
import { ColumnType } from 'astrospatial-core/metadata';

const xml = `<VOTABLE xmlns="http://www.ivoa.net/xml/VOTable/v1.3"><RESOURCE><TABLE>
<FIELD name="right_ascension" datatype="double" unit="deg" ucd="pos.eq.ra"><DESCRIPTION>RA</DESCRIPTION></FIELD>
<FIELD name="dec" datatype="double" unit="deg" ucd="pos.eq.dec"/>
<DATA><TABLEDATA><TR><TD>202.48</TD><TD>47.21</TD></TR></TABLEDATA></DATA>
</TABLE></RESOURCE></VOTABLE>`;

test('VOTable TABLEDATA preserves field metadata and row order', () => {
  const result = parseVOTable(xml);
  assert.deepEqual(result.rows, [['202.48', '47.21']]);
  assert.deepEqual(result.columns.map(c => c.name), ['right_ascension', 'dec']);
  assert.equal(result.columns[0].description, 'RA');
  assert.equal(result.columns[0].columnType, ColumnType.GEOM_RA);
  assert.equal(result.columns[1].columnType, ColumnType.GEOM_DEC);
});

test('empty TABLEDATA retains fields', () => {
  const result = parseVOTable(xml.replace('<TR><TD>202.48</TD><TD>47.21</TD></TR>', ''));
  assert.equal(result.columns.length, 2);
  assert.deepEqual(result.rows, []);
});

test('BINARY, BINARY2, FITS explicitly unsupported', () => {
  for (const format of ['BINARY', 'BINARY2', 'FITS']) {
    assert.throws(() => parseVOTable(xml.replace('<TABLEDATA><TR><TD>202.48</TD><TD>47.21</TD></TR></TABLEDATA>', `<${format}/>`)), { code: 'NOT_IMPLEMENTED' });
  }
});

test('explicit alias fallback uses source metadata', () => {
  const withoutUcd = xml.replace(' ucd="pos.eq.ra"', '');
  const result = parseVOTable(withoutUcd, {
    aliases: { right_ascension: 'ra' },
    sourceColumns: [{ column_name: 'ra', table_name: 'example', description: '', unit: 'deg', ucd: 'pos.eq.ra', utype: '', datatype: 'double', arraysize: '', xtype: '', principal: '', indexed: '', std: '' }],
  });
  assert.equal(result.columns[0].columnType, ColumnType.GEOM_RA);
});

test('malformed XML and mismatched row length are rejected', () => {
  assert.throws(() => parseVOTable('<VOTABLE><RESOURCE>'), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseVOTable(xml.replace('<TD>47.21</TD>', '')), { code: 'INVALID_RESPONSE' });
});
