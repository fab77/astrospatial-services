import { ColumnType, MetadataColumn, type AstroTable } from 'astrospatial-core/metadata';
import { ServiceError } from '../../core/ServiceError.js';

export interface ColumnMapping {
  ra: string;
  dec: string;
  name?: string;
  footprint?: string;
}

export interface JsonTableInput {
  mapping: ColumnMapping;
  columns: ReadonlyArray<{ name: string; unit?: string; description?: string; numeric?: boolean }>;
  rows: ReadonlyArray<ReadonlyArray<unknown>>;
}

function invalid(message: string): never {
  throw new ServiceError('INVALID_RESPONSE', message);
}

function buildColumns(
  definitions: ReadonlyArray<{ name: string; unit?: string; description?: string; numeric?: boolean }>,
  mapping: ColumnMapping,
): MetadataColumn[] {
  if (!definitions.length) invalid('Table has no columns');
  const names = definitions.map((column) => column.name);
  if (names.some((name) => !name || typeof name !== 'string') || new Set(names).size !== names.length)
    invalid('Table column names must be nonempty and unique');
  if (!mapping || !mapping.ra || !mapping.dec || !names.includes(mapping.ra) || !names.includes(mapping.dec))
    invalid('RA and Dec mappings must refer to existing columns');
  for (const optional of [mapping.name, mapping.footprint]) {
    if (optional && !names.includes(optional)) invalid(`Unknown mapped column: ${optional}`);
  }
  const roles = [mapping.ra, mapping.dec, mapping.name, mapping.footprint].filter(Boolean);
  if (new Set(roles).size !== roles.length) invalid('Column mappings must refer to distinct columns');
  return definitions.map((column, index) => new MetadataColumn({
    index,
    name: column.name,
    unit: column.unit ?? '',
    description: column.description ?? '',
    columnType: column.name === mapping.ra ? ColumnType.GEOM_RA
      : column.name === mapping.dec ? ColumnType.GEOM_DEC
      : column.name === mapping.name ? ColumnType.MAIN_NAME
      : column.name === mapping.footprint ? ColumnType.GEOM_FOOTPRINT
      : column.numeric ? ColumnType.NUMBER : ColumnType.STRING,
  }));
}

function validateRows(rows: ReadonlyArray<ReadonlyArray<unknown>>, width: number): string[][] {
  if (!Array.isArray(rows)) invalid('Table rows must be an array');
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== width) invalid(`Row ${index} has an invalid column count`);
    return row.map((value) => value == null ? '' : String(value));
  });
}

/** Parse either a structured table fixture or an array of plain JSON objects. */
export function parseJsonTable(
  input: JsonTableInput | ReadonlyArray<Record<string, unknown>> | string,
  options?: { mapping: ColumnMapping },
): AstroTable {
  let data: unknown;
  try { data = typeof input === 'string' ? JSON.parse(input) : input; }
  catch { return invalid('Malformed JSON table'); }

  if (Array.isArray(data)) {
    if (!options?.mapping) invalid('JSON object arrays require an explicit column mapping');
    if (!data.length) invalid('Cannot infer columns from an empty JSON object array');
    if (data.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))
      invalid('JSON array must contain objects');
    const records = data as Record<string, unknown>[];
    const names = Object.keys(records[0]);
    if (records.some((row) => Object.keys(row).length !== names.length ||
      names.some((name) => !Object.prototype.hasOwnProperty.call(row, name))))
      invalid('JSON object rows must have identical keys');
    const columns = buildColumns(names.map((name) => ({
      name,
      numeric: records.every((row) => row[name] == null ||
        (typeof row[name] === 'number' && Number.isFinite(row[name]))),
    })), options.mapping);
    return { columns, rows: validateRows(records.map((row) => names.map((name) => row[name])), columns.length) };
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as JsonTableInput).columns))
    invalid('Missing JSON table columns');
  const fixture = data as JsonTableInput;
  const columns = buildColumns(fixture.columns, options?.mapping ?? fixture.mapping);
  return { columns, rows: validateRows(fixture.rows, columns.length) };
}

/** RFC 4180-style CSV, including escaped quotes and embedded newlines. */
function csvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell !== '' || closed) invalid('Malformed CSV quoting');
      quoted = true;
    } else if (char === ',') {
      record.push(cell); cell = ''; closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      record.push(cell); records.push(record); record = []; cell = ''; closed = false;
    } else {
      if (closed) invalid('Unexpected characters after CSV quote');
      cell += char;
    }
  }
  if (quoted) invalid('Unterminated CSV quoted field');
  if (cell !== '' || record.length || closed) { record.push(cell); records.push(record); }
  return records;
}

export interface CsvTableOptions {
  mapping: ColumnMapping;
  numericColumns?: readonly string[];
}

/** CSV columns come from its header; coordinate roles are explicitly mapped. */
export function parseCsvTable(csv: string, options: CsvTableOptions): AstroTable {
  const records = csvRecords(csv.replace(/^\uFEFF/, ''));
  if (!records.length) invalid('CSV has no header');
  const names = records[0];
  const numeric = new Set(options.numericColumns ?? []);
  const columns = buildColumns(names.map((name) => ({ name, numeric: numeric.has(name) })), options.mapping);
  return { columns, rows: validateRows(records.slice(1), columns.length) };
}
