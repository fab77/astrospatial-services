import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';

export interface ResolvedPlace {
  id: string;
  label: string;
  longitudeDeg: number;
  latitudeDeg: number;
  type?: string;
  category?: string;
  importance?: number;
  boundingBox?: [south: number, north: number, west: number, east: number];
  address?: Record<string, string>;
  provider: 'Nominatim';
}

export interface PlaceSearchOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface PlaceResolver {
  search(query: string, options?: PlaceSearchOptions): Promise<ResolvedPlace[]>;
}

export interface NominatimServiceOptions {
  endpoint?: string;
  userAgent: string;
  email?: string;
  timeoutMs?: number;
  transport?: HttpTransport;
}

type NominatimRecord = Record<string, unknown>;

function normalizeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new TypeError(`Invalid Nominatim endpoint: ${endpoint}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Nominatim endpoint must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new TypeError('Nominatim endpoint must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new TypeError('Nominatim endpoint must not contain query or fragment');
  }
  if (!url.pathname.endsWith('/search')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/search`;
  }
  return url;
}

function parseBoundingBox(value: unknown): ResolvedPlace['boundingBox'] {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite)
    ? numbers as ResolvedPlace['boundingBox']
    : undefined;
}

function parseAddress(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const address = Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
      .map(([key, item]) => [key, String(item)]),
  );
  return Object.keys(address).length ? address : undefined;
}

export function parseNominatimSearchResponse(value: string | unknown): ResolvedPlace[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new ServiceError('INVALID_RESPONSE', 'Invalid Nominatim JSON response', undefined, { cause: error });
    }
  }
  if (!Array.isArray(parsed)) {
    throw new ServiceError('INVALID_RESPONSE', 'Nominatim search response must be an array');
  }

  return parsed.flatMap((entry): ResolvedPlace[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as NominatimRecord;
    const longitudeDeg = Number(item.lon);
    const latitudeDeg = Number(item.lat);
    const label = typeof item.display_name === 'string'
      ? item.display_name.trim()
      : '';
    if (
      !label ||
      !Number.isFinite(longitudeDeg) ||
      longitudeDeg < -180 ||
      longitudeDeg > 180 ||
      !Number.isFinite(latitudeDeg) ||
      latitudeDeg < -90 ||
      latitudeDeg > 90
    ) return [];

    const importance = Number(item.importance);
    const boundingBox = parseBoundingBox(item.boundingbox);
    const address = parseAddress(item.address);
    const type = typeof item.type === 'string' && item.type.trim()
      ? item.type.trim()
      : undefined;
    const category = typeof item.class === 'string' && item.class.trim()
      ? item.class.trim()
      : undefined;

    return [{
      id: String(item.place_id ?? `${latitudeDeg},${longitudeDeg}`),
      label,
      longitudeDeg,
      latitudeDeg,
      ...(type ? { type } : {}),
      ...(category ? { category } : {}),
      ...(Number.isFinite(importance) ? { importance } : {}),
      ...(boundingBox ? { boundingBox } : {}),
      ...(address ? { address } : {}),
      provider: 'Nominatim',
    }];
  });
}

/** OpenStreetMap Nominatim forward geocoder. Use from a server or compliant proxy. */
export class NominatimService implements PlaceResolver {
  private readonly endpoint: URL;
  private readonly userAgent: string;
  private readonly email?: string;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: NominatimServiceOptions) {
    if (!options?.userAgent?.trim()) {
      throw new TypeError('Nominatim userAgent must identify the calling application');
    }
    this.endpoint = normalizeEndpoint(options.endpoint ?? 'https://nominatim.openstreetmap.org/');
    this.userAgent = options.userAgent.trim();
    this.email = options.email?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.transport = options.transport ?? new FetchHttpTransport();
  }

  async search(query: string, options: PlaceSearchOptions = {}): Promise<ResolvedPlace[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      throw new TypeError('Place query must contain at least 3 characters');
    }
    const limit = options.limit ?? 8;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new RangeError('Place search limit must be an integer between 1 and 10');
    }

    const url = new URL(this.endpoint);
    url.searchParams.set('q', normalizedQuery);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));
    if (this.email) url.searchParams.set('email', this.email);

    const requestOptions = { signal: options.signal, timeoutMs: this.timeoutMs };
    const response = this.transport.request
      ? await this.transport.request(url.toString(), {
          ...requestOptions,
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': this.userAgent,
          },
        }).then((result) => result.body)
      : await this.transport.getText(url.toString(), requestOptions);
    return parseNominatimSearchResponse(response);
  }
}
