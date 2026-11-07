import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import type { AstroTable } from "astrospatial-core/metadata";
import { ServiceError } from "../../core/ServiceError.js";
import type { TapColumn } from "./TapService.js";
import { tapColumnsToMetadata } from "./TapMetadataAdapter.js";

export interface VOTableResult extends AstroTable {}

export interface VOTableOptions {
  /** Output column name -> original TAP_SCHEMA column name. */
  aliases?: Readonly<Record<string, string>>;
  sourceColumns?: readonly TapColumn[];
}

function children(element: XmlElement, name: string): XmlElement[] {
  return Array.from(element.childNodes)
    .filter((node): node is XmlElement => node.nodeType === 1)
    .filter((node) => node.localName === name || node.nodeName === name);
}

function descendants(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as XmlElement;
    if (el.localName === name || el.nodeName === name) found.push(el);
    found.push(...descendants(el, name));
  }
  return found;
}

/** Parse one XML/TABLEDATA VOTable table; no BINARY, BINARY2 or FITS support yet. */
export function parseVOTable(xml: string, options: VOTableOptions = {}): VOTableResult {
  const errors: string[] = [];
  let document: ReturnType<DOMParser["parseFromString"]>;
  try {
    document = new DOMParser({
      errorHandler: (level, message) => {
        if (level !== "warning") errors.push(message);
      },
    }).parseFromString(xml, "application/xml");
  } catch (cause) {
    throw new ServiceError("INVALID_RESPONSE", "Malformed VOTable XML", undefined, { cause });
  }
  if (errors.length || !document?.documentElement || document.documentElement.localName !== "VOTABLE") {
    throw new ServiceError("INVALID_RESPONSE", "Malformed VOTable XML");
  }
  const tables = descendants(document.documentElement, "TABLE");
  if (tables.length !== 1) {
    throw new ServiceError("INVALID_RESPONSE", "Expected exactly one VOTable TABLE");
  }
  const table = tables[0];
  const data = children(table, "DATA");
  if (data.length !== 1) throw new ServiceError("INVALID_RESPONSE", "Missing VOTable DATA");
  const unsupported = ["BINARY", "BINARY2", "FITS"].find((name) => children(data[0], name).length > 0);
  if (unsupported) throw new ServiceError("NOT_IMPLEMENTED", `VOTable ${unsupported} serialization is not implemented yet`);
  const tableData = children(data[0], "TABLEDATA");
  if (tableData.length !== 1) throw new ServiceError("INVALID_RESPONSE", "Missing VOTable TABLEDATA");
  const fields = children(table, "FIELD");
  if (!fields.length) throw new ServiceError("INVALID_RESPONSE", "Missing VOTable FIELD");
  const names = fields.map((field, i) => field.getAttribute("name") || field.getAttribute("ID") || `column_${i}`);
  const source = new Map((options.sourceColumns ?? []).map((col) => [col.column_name, col]));
  const columns: TapColumn[] = fields.map((field, i) => {
    const name = names[i];
    const original = source.get(options.aliases?.[name] ?? name);
    const description = children(field, "DESCRIPTION")[0]?.textContent?.trim() || "";
    const attr = (key: string) => field.getAttribute(key) || "";
    return {
      table_name: original?.table_name ?? "",
      column_name: name,
      description: description || original?.description || "",
      unit: attr("unit") || original?.unit || "",
      ucd: attr("ucd") || original?.ucd || "",
      utype: attr("utype") || original?.utype || "",
      datatype: attr("datatype") || original?.datatype || "",
      arraysize: attr("arraysize") || original?.arraysize || "",
      xtype: attr("xtype") || original?.xtype || "",
      principal: original?.principal ?? "",
      indexed: original?.indexed ?? "",
      std: original?.std ?? "",
    };
  });
  const rows = children(tableData[0], "TR").map((tr) => {
    const values = children(tr, "TD").map((td) => td.textContent ?? "");
    if (values.length !== fields.length) throw new ServiceError("INVALID_RESPONSE", "VOTable row column count mismatch");
    return values;
  });
  return { columns: tapColumnsToMetadata(columns), rows };
}
