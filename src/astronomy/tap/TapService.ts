import {
  FetchHttpTransport,
  type HttpTransport,
  type HttpResponse,
} from "../../core/HttpTransport.js";
import { ServiceError } from "../../core/ServiceError.js";

export type TapOutputFormat = "json" | "csv" | "votable" | (string & {});

export interface TapServiceOptions {
  endpoint: string;
  transport?: HttpTransport;
  timeoutMs?: number;
}

export interface TapSyncQuery {
  adql: string;
  format?: TapOutputFormat;
  maxrec?: number;
  signal?: AbortSignal;
}

export interface TapQueryResponse {
  body: string;
  status: number;
  headers: Headers;
  contentType: string | null;
}

function tapBaseUrl(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError("Invalid TAP endpoint URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "TAP endpoint must be an HTTP(S) URL without credentials, query or fragment",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname.endsWith("/sync")) url.pathname = url.pathname.slice(0, -5);
  if (url.pathname.endsWith("/capabilities"))
    url.pathname = url.pathname.slice(0, -13);
  return url.toString().replace(/\/$/, "");
}

export interface TapSchema {
  schema_name: string;
  description: string;
  utype: string;
}
export interface TapTable {
  schema_name: string;
  table_name: string;
  table_type: string;
  description: string;
  utype: string;
}
export interface TapColumn {
  table_name: string;
  column_name: string;
  description: string;
  unit: string;
  ucd: string;
  utype: string;
  datatype: string;
  arraysize: string;
  xtype: string;
  principal: string;
  indexed: string;
  std: string;
}
export interface TapCsvTable {
  columns: string[];
  rows: Record<string, string>[];
}

/** Parse RFC-style CSV with quoted commas, escaped quotes and embedded newlines. */
export function parseTapCsvTable(csv: string): TapCsvTable {
  // Ignore an optional UTF-8 BOM at the beginning of the CSV.
  if (csv.startsWith('\uFEFF')) {
    csv = csv.slice(1);
  }
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else field += c;
    } else if (afterQuote) {
      if (c === ",") {
        row.push(field);
        field = "";
        afterQuote = false;
      } else if (c === "\n" || c === "\r") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        afterQuote = false;
        if (c === "\r" && csv[i + 1] === "\n") i++;
      } else
        throw new ServiceError("INVALID_RESPONSE", "Malformed TAP CSV quoting");
    } else if (c === '"') {
      if (field)
        throw new ServiceError("INVALID_RESPONSE", "Malformed TAP CSV quoting");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else field += c;
  }
  if (quoted)
    throw new ServiceError("INVALID_RESPONSE", "Unterminated TAP CSV field");
  if (afterQuote || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length || !rows[0].length || rows[0].some((h) => !h)) {
    throw new ServiceError("INVALID_RESPONSE", "Missing TAP CSV header");
  }
  const [headers, ...data] = rows;

  const columns = headers.map((h) => h.replace(/^\uFEFF/, ""));

  return {
    columns,
    rows: data.map((values) => {
      if (values.length !== headers.length) {
        throw new ServiceError(
          "INVALID_RESPONSE",
          "TAP CSV column count mismatch",
        );
      }

      return Object.fromEntries(columns.map((name, i) => [name, values[i]]));
    }),
  };
}

/**
 * Parse TAP CSV and return data rows.
 * Preserves the existing public API.
 */
export function parseTapCsv(csv: string): Record<string, string>[] {
  return parseTapCsvTable(csv).rows;
}

function sqlLiteral(value: string): string {
  if (!value.trim())
    throw new TypeError("TAP metadata filter must not be blank");
  return "'" + value.replace(/'/g, "''") + "'";
}

/** TAP 1.x synchronous ADQL client. No rendering or backend dependency. */
export class TapService {
  private readonly baseUrl: string;
  private readonly url: string;
  private readonly transport: HttpTransport;
  private readonly timeoutMs: number;

  constructor(options: TapServiceOptions) {
    this.baseUrl = tapBaseUrl(options.endpoint);
    this.url = this.baseUrl + "/sync";
    this.transport = options.transport ?? new FetchHttpTransport();
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive finite number");
    }
  }

  /** Raw VOSI capabilities XML; parsing is intentionally left to the caller. */
  async getCapabilities(
    options: { signal?: AbortSignal } = {},
  ): Promise<string> {
    return this.transport.getText(this.baseUrl + "/capabilities", {
      signal: options.signal,
      timeoutMs: this.timeoutMs,
    });
  }

  private async metadataRows<T extends object>(
    adql: string,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const response = await this.querySync({ adql, format: "csv", signal });
    if (
      response.contentType &&
      !/\b(csv|text\/plain)\b/i.test(response.contentType)
    ) {
      throw new ServiceError(
        "INVALID_RESPONSE",
        "TAP metadata query did not return CSV",
      );
    }
    return parseTapCsv(response.body) as T[];
  }

  async listSchemas(
    options: { signal?: AbortSignal } = {},
  ): Promise<TapSchema[]> {
    return this.metadataRows<TapSchema>(
      "SELECT schema_name, description, utype FROM TAP_SCHEMA.schemas",
      options.signal,
    );
  }

  async listTables(
    options: { schemaName?: string; signal?: AbortSignal } = {},
  ): Promise<TapTable[]> {
    const where =
      options.schemaName === undefined
        ? ""
        : " WHERE schema_name = " + sqlLiteral(options.schemaName);
    return this.metadataRows<TapTable>(
      "SELECT schema_name, table_name, table_type, description, utype FROM TAP_SCHEMA.tables" +
        where,
      options.signal,
    );
  }

  async listColumns(
    tableName: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<TapColumn[]> {
    return this.metadataRows<TapColumn>(
      "SELECT table_name, column_name, description, unit, ucd, utype, datatype, arraysize, xtype, principal, indexed, std FROM TAP_SCHEMA.columns WHERE table_name = " +
        sqlLiteral(tableName),
      options.signal,
    );
  }

  async querySync(query: TapSyncQuery): Promise<TapQueryResponse> {
    if (typeof query.adql !== "string" || !query.adql.trim()) {
      throw new TypeError("ADQL query must not be blank");
    }
    if (
      query.maxrec !== undefined &&
      (!Number.isSafeInteger(query.maxrec) || query.maxrec < 0)
    ) {
      throw new RangeError("maxrec must be a non-negative safe integer");
    }
    const form = new URLSearchParams({
      REQUEST: "doQuery",
      LANG: "ADQL",
      QUERY: query.adql,
      FORMAT: query.format ?? "votable",
    });
    if (query.maxrec !== undefined) form.set("MAXREC", String(query.maxrec));
    if (!this.transport.request) {
      throw new ServiceError(
        "INVALID_RESPONSE",
        "TAP requires an HTTP transport supporting POST requests",
      );
    }
    const response: HttpResponse = await this.transport.request(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "*/*",
      },
      body: form.toString(),
      signal: query.signal,
      timeoutMs: this.timeoutMs,
    });
    return {
      body: response.body,
      status: response.status,
      headers: response.headers,
      contentType: response.headers.get("content-type"),
    };
  }
}
