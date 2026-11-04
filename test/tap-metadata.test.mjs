import test from "node:test";
import assert from "node:assert/strict";

import { tapColumnsToMetadata } from "../lib-esm/astronomy/tap/index.js";

import { ColumnType, MetadataColumn } from "astrospatial-core/metadata";

function tapColumn(overrides = {}) {
  return {
    table_name: "observations.example",
    column_name: "value",
    description: "",
    unit: "",
    ucd: "",
    utype: "",
    datatype: "char",
    arraysize: "",
    xtype: "",
    principal: "0",
    indexed: "0",
    std: "0",
    ...overrides,
  };
}

test("converts TAP columns to shared MetadataColumn instances", () => {
  const columns = tapColumnsToMetadata([
    tapColumn({
      column_name: "ra",
      description: "Right ascension",
      unit: "deg",
      ucd: "pos.eq.ra;meta.main",
      datatype: "double",
    }),
    tapColumn({
      column_name: "dec",
      unit: "deg",
      ucd: "pos.eq.dec;meta.main",
      datatype: "double",
    }),
    tapColumn({
      column_name: "flux",
      unit: "Jy",
      datatype: "double",
    }),
  ]);

  assert.equal(columns.length, 3);
  assert.ok(columns.every((c) => c instanceof MetadataColumn));

  assert.equal(columns[0].index, 0);
  assert.equal(columns[0].name, "ra");
  assert.equal(columns[0].description, "Right ascension");
  assert.equal(columns[0].unit, "deg");
  assert.equal(columns[0].columnType, ColumnType.GEOM_RA);

  assert.equal(columns[1].columnType, ColumnType.GEOM_DEC);
  assert.equal(columns[2].columnType, ColumnType.NUMBER);
});

test("preserves TAP-specific metadata details", () => {
  const [column] = tapColumnsToMetadata([
    tapColumn({
      column_name: "fov",
      ucd: "pos.outline;meta.pgsphere",
      datatype: "char",
      arraysize: "*",
      xtype: "polygon",
      principal: "1",
    }),
  ]);

  assert.equal(column.columnType, ColumnType.GEOM_FOOTPRINT);
  assert.equal(column.getString("ucd"), "pos.outline;meta.pgsphere");
  assert.equal(column.getString("xtype"), "polygon");
  assert.equal(column.getString("arraysize"), "*");
  assert.equal(column.getString("principal"), "1");
  assert.equal(column.getString("table_name"), "observations.example");
});

test("does not infer geometry from column names alone", () => {
  const columns = tapColumnsToMetadata([
    tapColumn({ column_name: "ra", datatype: "char" }),
    tapColumn({ column_name: "dec", datatype: "char" }),
    tapColumn({ column_name: "fov", datatype: "char" }),
  ]);

  assert.deepEqual(
    columns.map((c) => c.columnType),
    [ColumnType.STRING, ColumnType.STRING, ColumnType.STRING],
  );
});

test("recognizes main identifiers and preserves input order", () => {
  const columns = tapColumnsToMetadata([
    tapColumn({
      column_name: "source_id",
      ucd: "meta.id;meta.main",
    }),
    tapColumn({
      column_name: "source_name",
      ucd: "meta.id",
    }),
  ]);

  assert.equal(columns[0].columnType, ColumnType.MAIN_NAME);
  assert.equal(columns[1].columnType, ColumnType.STRING);
  assert.deepEqual(
    columns.map((c) => c.index),
    [0, 1],
  );
});

test("does not classify numeric arrays as scalar numbers", () => {
  const [column] = tapColumnsToMetadata([
    tapColumn({
      column_name: "vector",
      datatype: "double",
      arraysize: "3",
    }),
  ]);

  assert.equal(column.columnType, ColumnType.STRING);
  assert.equal(column.getString("arraysize"), "3");
});

test("does not classify textual RA as numeric geometry", () => {
  const [column] = tapColumnsToMetadata([
    tapColumn({
      column_name: "ra_text",
      datatype: "char",
      arraysize: "*",
      ucd: "pos.eq.ra;meta.main",
    }),
  ]);

  assert.equal(column.columnType, ColumnType.STRING);
  assert.equal(column.getString("ucd"), "pos.eq.ra;meta.main");
});
