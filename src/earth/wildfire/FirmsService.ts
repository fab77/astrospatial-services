import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
import { parseFirmsCsv } from './FirmsParser.js';
import {
  FIRMS_SOURCES,
  type FirmsAreaQuery,
  type FirmsAreaResult,
  type GeographicBoundingBox,
} from './types.js';

const OFFICIAL_AREA_ENDPOINT = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/';

export type FirmsAuthentication =
  | { kind: 'map-key'; mapKey: string }
  | { kind: 'relay' };

export interface FirmsServiceOptions {
  authentication: FirmsAuthentication;
  endpoint?: string;
  timeoutMs?: number;
  transport?: HttpTransport;
}

function normalizeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new TypeError(`Invalid FIRMS endpoint: ${endpoint}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('FIRMS endpoint must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('FIRMS endpoint must not contain credentials, query or fragment');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('FIRMS startDate must use YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('FIRMS startDate must be a valid calendar date');
  }
}

function areaPath(area: GeographicBoundingBox | 'world'): string {
  if (area === 'world') return area;
  const coordinates = [area.west, area.south, area.east, area.north];
  if (!coordinates.every(Number.isFinite)) {
    throw new TypeError('FIRMS area coordinates must be finite numbers');
  }
  if (
    area.west < -180 || area.west > 180 ||
    area.east < -180 || area.east > 180 ||
    area.south < -90 || area.south > 90 ||
    area.north < -90 || area.north > 90 ||
    area.west >= area.east || area.south >= area.north
  ) {
    throw new RangeError('FIRMS area must be an ordered geographic bounding box');
  }
  return coordinates.join(',');
}

/** NASA FIRMS area client. Use relay authentication in browsers to keep MAP_KEY server-side. */
export class FirmsService {
  private readonly authentication: FirmsAuthentication;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: FirmsServiceOptions) {
    if (!options?.authentication) throw new TypeError('FIRMS authentication is required');
    if (options.authentication.kind === 'map-key' && !options.authentication.mapKey.trim()) {
      throw new TypeError('FIRMS mapKey must not be blank');
    }
    if (options.authentication.kind === 'relay' && !options.endpoint) {
      throw new TypeError('FIRMS relay authentication requires a custom endpoint');
    }
    this.authentication = options.authentication;
    this.endpoint = normalizeEndpoint(options.endpoint ?? OFFICIAL_AREA_ENDPOINT);
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.transport = options.transport ?? new FetchHttpTransport();
  }

  async queryArea(query: FirmsAreaQuery): Promise<FirmsAreaResult> {
    if (!query || !FIRMS_SOURCES.includes(query.source)) {
      throw new TypeError('Unsupported FIRMS source');
    }
    if (!Number.isInteger(query.dayRange) || query.dayRange < 1 || query.dayRange > 5) {
      throw new RangeError('FIRMS dayRange must be an integer between 1 and 5');
    }
    if (query.startDate) validateDate(query.startDate);

    const path = [
      ...(this.authentication.kind === 'map-key'
        ? [encodeURIComponent(this.authentication.mapKey.trim())]
        : []),
      query.source,
      // FIRMS requires literal commas in the bounding-box path segment.
      areaPath(query.area),
      String(query.dayRange),
      ...(query.startDate ? [query.startDate] : []),
    ].join('/');
    const url = new URL(path, this.endpoint).toString();
    let response: string;
    try {
      response = await this.transport.getText(url, {
        signal: query.signal,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        throw new ServiceError(
          error.code,
          `NASA FIRMS request failed${error.status ? ` with HTTP ${error.status}` : ''}`,
          error.status,
          { cause: error },
        );
      }
      throw new ServiceError(
        'NETWORK',
        'NASA FIRMS request failed',
        undefined,
        { cause: error },
      );
    }
    return {
      detections: parseFirmsCsv(response, query.source),
      source: query.source,
      area: query.area,
      dayRange: query.dayRange,
      ...(query.startDate ? { startDate: query.startDate } : {}),
      provider: 'NASA FIRMS',
    };
  }
}
