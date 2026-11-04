import { FetchHttpTransport, type HttpTransport } from "../../core/HttpTransport.js";
import { ServiceError } from "../../core/ServiceError.js";

export type HiPSMetadata = Record<string, string>;

export interface HiPSSurveyEntry {
  serviceUrl: string;
  creatorDid?: string;
  releaseDate?: string;
  metadata: HiPSMetadata;
}

export interface HiPSProperties {
  serviceUrl: string;
  creatorDid?: string;
  title?: string;
  order?: number;
  frame?: string;
  tileFormats: string[];
  metadata: HiPSMetadata;
}

export interface HiPSNodeServiceOptions {
  transport?: HttpTransport;
  timeoutMs?: number;
}

export interface HiPSRequestOptions { signal?: AbortSignal }

/** Parse HiPS key=value lines; retain unknown keys and values containing '='. */
export function parseHiPSMetadata(text: string): HiPSMetadata {
  const metadata: HiPSMetadata = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    metadata[key] = line.slice(separator + 1).trim();
  }
  return metadata;
}

/** Parse CDS-style hipslist records separated by blank lines. */
export function parseHiPSList(text: string): HiPSSurveyEntry[] {
  if (typeof text !== 'string') throw new TypeError('HiPS list must be text');
  const blocks = text.split(/(?:\r?\n)[ \t]*(?:\r?\n)+/);
  const entries: HiPSSurveyEntry[] = [];
  for (const block of blocks) {
    const metadata = parseHiPSMetadata(block);
    const serviceUrl = metadata.hips_service_url;
    if (!serviceUrl) continue;
    entries.push({
      serviceUrl,
      ...(metadata.creator_did ? { creatorDid: metadata.creator_did } : {}),
      ...(metadata.hips_release_date ? { releaseDate: metadata.hips_release_date } : {}),
      metadata,
    });
  }
  return entries;
}

function normalizeHttpUrl(url: string, filename: string): string {
  const value = url.trim();
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new TypeError(`Invalid HiPS URL: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('HiPS URL must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) throw new TypeError('HiPS URL must not contain credentials');
  if (parsed.pathname.endsWith('/' + filename)) return parsed.toString();
  if (parsed.search || parsed.hash) throw new TypeError('HiPS base URL must not have query or fragment');
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/' + filename;
  return parsed.toString();
}

export function parseHiPSProperties(text: string, serviceUrl: string): HiPSProperties {
  const metadata = parseHiPSMetadata(text);
  if (Object.keys(metadata).length === 0) {
    throw new ServiceError('INVALID_RESPONSE', 'Empty or invalid HiPS properties');
  }
  const orderText = metadata.hips_order;
  const order = orderText === undefined ? undefined : Number(orderText);
  if (orderText !== undefined && (!Number.isInteger(order) || order! < 0)) {
    throw new ServiceError('INVALID_RESPONSE', 'Invalid hips_order');
  }
  return {
    serviceUrl,
    ...(metadata.creator_did ? { creatorDid: metadata.creator_did } : {}),
    ...(metadata.obs_title ? { title: metadata.obs_title } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(metadata.hips_frame ? { frame: metadata.hips_frame } : {}),
    tileFormats: metadata.hips_tile_format?.split(/\s+/).filter(Boolean) ?? [],
    metadata,
  };
}

/** HTTP-only HiPS discovery and properties, independent of rendering engines. */
export class HiPSNodeService {
  private readonly transport: HttpTransport;
  private readonly timeoutMs: number;

  constructor(options: HiPSNodeServiceOptions = {}) {
    this.transport = options.transport ?? new FetchHttpTransport();
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async listSurveys(nodeUrl: string, options: HiPSRequestOptions = {}): Promise<HiPSSurveyEntry[]> {
    const url = normalizeHttpUrl(nodeUrl, 'hipslist');
    const text = await this.transport.getText(url, { signal: options.signal, timeoutMs: this.timeoutMs });
    const surveys = parseHiPSList(text);
    if (surveys.length === 0 && text.trim()) {
      throw new ServiceError('INVALID_RESPONSE', `No HiPS entries found at ${url}`);
    }
    return surveys;
  }

  async getProperties(serviceUrl: string, options: HiPSRequestOptions = {}): Promise<HiPSProperties> {
    const url = normalizeHttpUrl(serviceUrl, 'properties');
    const text = await this.transport.getText(url, { signal: options.signal, timeoutMs: this.timeoutMs });
    const base = url.slice(0, -'/properties'.length);
    return parseHiPSProperties(text, base);
  }
}
