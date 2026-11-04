import { FetchHttpTransport, type HttpTransport, type HttpResponse } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';

export type TapOutputFormat = 'json' | 'csv' | 'votable' | (string & {});

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

function syncUrl(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new TypeError('Invalid TAP endpoint URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError('TAP endpoint must be an HTTP(S) URL without credentials, query or fragment');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/sync')) url.pathname += '/sync';
  return url.toString();
}

/** TAP 1.x synchronous ADQL client. No rendering or backend dependency. */
export class TapService {
  private readonly url: string;
  private readonly transport: HttpTransport;
  private readonly timeoutMs: number;

  constructor(options: TapServiceOptions) {
    this.url = syncUrl(options.endpoint);
    this.transport = options.transport ?? new FetchHttpTransport();
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
  }

  async querySync(query: TapSyncQuery): Promise<TapQueryResponse> {
    if (typeof query.adql !== 'string' || !query.adql.trim()) {
      throw new TypeError('ADQL query must not be blank');
    }
    if (query.maxrec !== undefined && (!Number.isSafeInteger(query.maxrec) || query.maxrec < 0)) {
      throw new RangeError('maxrec must be a non-negative safe integer');
    }
    const form = new URLSearchParams({
      REQUEST: 'doQuery',
      LANG: 'ADQL',
      QUERY: query.adql,
      FORMAT: query.format ?? 'votable',
    });
    if (query.maxrec !== undefined) form.set('MAXREC', String(query.maxrec));
    if (!this.transport.request) {
      throw new ServiceError('INVALID_RESPONSE', 'TAP requires an HTTP transport supporting POST requests');
    }
    const response: HttpResponse = await this.transport.request(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: '*/*',
      },
      body: form.toString(),
      signal: query.signal,
      timeoutMs: this.timeoutMs,
    });
    return {
      body: response.body,
      status: response.status,
      headers: response.headers,
      contentType: response.headers.get('content-type'),
    };
  }
}
