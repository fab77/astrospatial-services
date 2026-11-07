import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonTable, parseCsvTable } from '../lib-esm/index.js';
import { ColumnType, MetadataColumn, MetadataManager } from 'astrospatial-core/metadata';

const mapping = { ra: 'ra', dec: 'dec', name: 'id', footprint: 'outline' };
const columns = [
  { name: 'id' }, { name: 'ra', unit: 'deg', numeric: true },
  { name: 'dec', unit: 'deg', numeric: true }, { name: 'outline' },
  { name: 'flux', unit: 'Jy', numeric: true },
];

test('JSON preserves column order, roles, metadata, and row values', () => {
  const table = parseJsonTable({ mapping, columns, rows: [['M51', 202.47, 47.2, 'POLYGON ...', 0.5], ['M101', null, -2, '', 0]] });
  assert.deepEqual(table.columns.map(c => c.name), ['id', 'ra', 'dec', 'outline', 'flux']);
  assert.deepEqual(table.columns.map(c => c.columnType), [ColumnType.MAIN_NAME, ColumnType.GEOM_RA, ColumnType.GEOM_DEC, ColumnType.GEOM_FOOTPRINT, ColumnType.NUMBER]);
  assert.ok(table.columns.every(c => c instanceof MetadataColumn));
  assert.equal(table.columns[4].unit, 'Jy');
  assert.deepEqual(table.rows, [['M51', '202.47', '47.2', 'POLYGON ...', '0.5'], ['M101', '', '-2', '', '0']]);
  const metadata = new MetadataManager(table.columns);
  assert.equal(metadata.selectedRaColumn?.name, 'ra');
  assert.equal(metadata.selectedDecColumn?.name, 'dec');
});

test('JSON string input and empty rows', () => {
  const table = parseJsonTable(JSON.stringify({ mapping: { ra: 'ra', dec: 'dec' }, columns: columns.slice(1, 3), rows: [] }));
  assert.equal(table.columns.length, 2);
  assert.deepEqual(table.rows, []);
});

test('JSON rejects invalid schema, mapping and row widths', () => {
  const base = { mapping, columns, rows: [] };
  for (const data of [
    '{invalid', { ...base, mapping: { ra: 'missing', dec: 'dec' } },
    { ...base, mapping: { ra: 'ra', dec: 'ra' } },
    { ...base, columns: [...columns, { name: 'ra' }] },
    { ...base, rows: [['short']] },
    { ...base, rows: null },
  ]) assert.throws(() => parseJsonTable(data), /./);
});

test('CSV parses quoted commas, escaped quotes, multiline cells, CRLF and BOM', () => {
  const csv = '\uFEFFid,ra,dec,outline,flux\r\n"M,51",202.47,47.2,"line 1\nline ""2""",0.5\r\nM101,210,-2,,1\r\n';
  const table = parseCsvTable(csv, { mapping, numericColumns: ['flux'] });
  assert.deepEqual(table.rows, [['M,51', '202.47', '47.2', 'line 1\nline "2"', '0.5'], ['M101', '210', '-2', '', '1']]);
  assert.equal(table.columns[4].columnType, ColumnType.NUMBER);
  assert.equal(table.columns[1].columnType, ColumnType.GEOM_RA);
});

test('CSV rejects invalid headers, mappings, quoting and row widths', () => {
  for (const csv of ['', 'ra,ra,dec\n1,2,3', 'ra,dec\n1', 'ra,dec\n"unterminated', 'ra,dec\n"x"oops,1']) {
    assert.throws(() => parseCsvTable(csv, { mapping: { ra: 'ra', dec: 'dec' } }), /./);
  }
  assert.throws(() => parseCsvTable('ra,dec\n1,2', { mapping: { ra: 'x', dec: 'dec' } }), /./);
});

test('JSON object arrays preserve insertion-order columns and infer numeric fields', () => {
  const table = parseJsonTable([
    { id: 'M51', ra: 202.47, dec: 47.2, flux: 0.5 },
    { id: 'M101', ra: 210, dec: -2, flux: null },
  ], { mapping: { ra: 'ra', dec: 'dec', name: 'id' } });
  assert.deepEqual(table.columns.map(c => c.name), ['id', 'ra', 'dec', 'flux']);
  assert.equal(table.columns[3].columnType, ColumnType.NUMBER);
  assert.deepEqual(table.rows[1], ['M101', '210', '-2', '']);
});

test('JSON object arrays reject missing mapping, inconsistent keys and invalid shapes', () => {
  const map = { mapping: { ra: 'ra', dec: 'dec' } };
  assert.throws(() => parseJsonTable([{ ra: 1, dec: 2 }]), /./);
  assert.throws(() => parseJsonTable([], map), /./);
  assert.throws(() => parseJsonTable([{ ra: 1, dec: 2 }, { ra: 2 }], map), /./);
  assert.throws(() => parseJsonTable('[null]', map), /./);
});

test('JSON fixture format remains supported with explicit metadata', () => {
  const table = parseJsonTable({ mapping, columns, rows: [['M51', 202.47, 47.2, '', 0.5]] });
  assert.equal(table.columns[4].unit, 'Jy');
  assert.equal(table.rows[0][0], 'M51');
});
