import { ColumnType, MetadataColumn } from "astrospatial-core/metadata";
import type { TapColumn } from "./TapService.js";

function columnType(column: TapColumn): ColumnType {
  const ucd = column.ucd.trim().toLowerCase();
  const datatype = column.datatype.trim().toLowerCase();

  const ucdTerms = ucd.split(";").map((term) => term.trim());
  const primaryUcd = ucdTerms[0];

  const arraysize = column.arraysize.trim();
  const isScalar = arraysize === "" || arraysize === "1";

  const numericTypes = new Set([
    "short",
    "int",
    "integer",
    "long",
    "float",
    "double",
    "unsignedbyte",
  ]);

  const isNumericScalar = numericTypes.has(datatype) && isScalar;

  if (primaryUcd === "pos.eq.ra" && isNumericScalar) {
    return ColumnType.GEOM_RA;
  }

  if (primaryUcd === "pos.eq.dec" && isNumericScalar) {
    return ColumnType.GEOM_DEC;
  }

  if (primaryUcd === "pos.outline") {
    return ColumnType.GEOM_FOOTPRINT;
  }

  if (primaryUcd === "meta.id" && ucdTerms.includes("meta.main")) {
    return ColumnType.MAIN_NAME;
  }

  return isNumericScalar ? ColumnType.NUMBER : ColumnType.STRING;
}

/**
 * Convert TAP_SCHEMA column descriptions into shared metadata columns.
 *
 * TAP-specific attributes remain available in MetadataColumn.details.
 * This function does not parse or convert query result values.
 */
export function tapColumnsToMetadata(
  columns: readonly TapColumn[],
): MetadataColumn[] {
  return columns.map((column, index) => {
    const details = new Map<string, string>();

    for (const key of [
      "table_name",
      "ucd",
      "utype",
      "datatype",
      "arraysize",
      "xtype",
      "principal",
      "indexed",
      "std",
    ] as const) {
      details.set(key, column[key]);
    }

    return new MetadataColumn({
      index,
      name: column.column_name,
      description: column.description,
      unit: column.unit,
      columnType: columnType(column),
      details,
    });
  });
}
