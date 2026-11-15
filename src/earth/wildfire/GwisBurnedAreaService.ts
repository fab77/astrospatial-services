import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
import type {
  BurnedAreaGeometry,
  BurnedAreaPerimeter,
  GeographicBoundingBox,
  GwisBurnedAreaQuery,
  GwisBurnedAreaResult,
} from './types.js';

const OFFICIAL_GWIS_WFS_ENDPOINT = 'https://maps.effis.emergency.copernicus.eu/gwis';

export interface GwisBurnedAreaServiceOptions {
  endpoint?: string;
  timeoutMs?: number;
  transport?: HttpTransport;
}

interface GwisGeoJsonFeature {
  id?: unknown;
  properties?: Record<string, unknown>;
  geometry?: unknown;
}

interface GwisGeoJsonCollection {
  type?: unknown;
  features?: unknown;
}

function normalizeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new TypeError(`Invalid GWIS endpoint: ${endpoint}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('GWIS endpoint must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('GWIS endpoint must not contain credentials, query or fragment');
  }
  return url;
}

function validateDate(name: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`GWIS ${name} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`GWIS ${name} must be a valid calendar date`);
  }
}

function validateArea(area: GeographicBoundingBox): void {
  const coordinates = [area.west, area.south, area.east, area.north];
  if (!coordinates.every(Number.isFinite)) {
    throw new TypeError('GWIS area coordinates must be finite numbers');
  }
  if (
    area.west < -180 || area.west > 180 ||
    area.east < -180 || area.east > 180 ||
    area.south < -90 || area.south > 90 ||
    area.north < -90 || area.north > 90 ||
    area.west >= area.east || area.south >= area.north
  ) {
    throw new RangeError('GWIS area must be an ordered geographic bounding box');
  }
}

function isoDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ServiceError('INVALID_RESPONSE', `GWIS ${field} is missing`);
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.valueOf())) {
    throw new ServiceError('INVALID_RESPONSE', `GWIS ${field} is invalid`);
  }
  return date.toISOString();
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
}

function isLinearRing(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function geometry(value: unknown): BurnedAreaGeometry {
  if (!value || typeof value !== 'object') {
    throw new ServiceError('INVALID_RESPONSE', 'GWIS geometry is missing');
  }
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (
    candidate.type === 'Polygon' &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.every(isLinearRing)
  ) {
    return { type: 'Polygon', coordinates: candidate.coordinates };
  }
  if (
    candidate.type === 'MultiPolygon' &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.every(
      (polygon) => Array.isArray(polygon) && polygon.every(isLinearRing),
    )
  ) {
    return { type: 'MultiPolygon', coordinates: candidate.coordinates };
  }
  throw new ServiceError('INVALID_RESPONSE', 'GWIS geometry must be Polygon or MultiPolygon');
}

function perimeter(feature: GwisGeoJsonFeature): BurnedAreaPerimeter {
  const properties = feature.properties ?? {};
  const id = String(properties.id ?? feature.id ?? '').trim();
  const fireId = String(properties.fire_id ?? '').trim();
  const areaHa = Number(properties.area);
  if (!id || !fireId || !Number.isFinite(areaHa) || areaHa < 0) {
    throw new ServiceError('INVALID_RESPONSE', 'GWIS perimeter metadata is invalid');
  }
  return {
    id,
    fireId,
    initialAt: isoDateTime(properties.initialdate, 'initialdate'),
    finalAt: isoDateTime(properties.finaldate, 'finaldate'),
    areaHa,
    geometry: geometry(feature.geometry),
    product: 'MODIS & VIIRS NRT',
    provider: 'Copernicus GWIS',
  };
}

function ogcFilter(query: GwisBurnedAreaQuery): string {
  // WFS 1.1 follows EPSG:4326 axis order in GML envelopes: latitude, longitude.
  const lowerCorner = `${query.area.south} ${query.area.west}`;
  const upperCorner = `${query.area.north} ${query.area.east}`;
  const areaFilter = query.minAreaHa === undefined
    ? ''
    : `<ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>area</ogc:PropertyName><ogc:Literal>${query.minAreaHa}</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo>`;
  return '<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml">' +
    '<ogc:And>' +
    '<ogc:BBOX><ogc:PropertyName>msGeometry</ogc:PropertyName>' +
    `<gml:Envelope srsName="EPSG:4326"><gml:lowerCorner>${lowerCorner}</gml:lowerCorner>` +
    `<gml:upperCorner>${upperCorner}</gml:upperCorner></gml:Envelope></ogc:BBOX>` +
    `<ogc:PropertyIsLessThanOrEqualTo><ogc:PropertyName>initialdate</ogc:PropertyName><ogc:Literal>${query.endDate} 23:59:59</ogc:Literal></ogc:PropertyIsLessThanOrEqualTo>` +
    `<ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>finaldate</ogc:PropertyName><ogc:Literal>${query.startDate} 00:00:00</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo>` +
    areaFilter +
    '</ogc:And></ogc:Filter>';
}

/** Copernicus GWIS WFS client for MODIS & VIIRS near-real-time burnt-area perimeters. */
export class GwisBurnedAreaService {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: GwisBurnedAreaServiceOptions = {}) {
    this.endpoint = normalizeEndpoint(options.endpoint ?? OFFICIAL_GWIS_WFS_ENDPOINT);
    this.timeoutMs = options.timeoutMs ?? 60000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.transport = options.transport ?? new FetchHttpTransport();
  }

  async queryPerimeters(query: GwisBurnedAreaQuery): Promise<GwisBurnedAreaResult> {
    if (!query) throw new TypeError('GWIS query is required');
    validateArea(query.area);
    validateDate('startDate', query.startDate);
    validateDate('endDate', query.endDate);
    if (query.startDate > query.endDate) {
      throw new RangeError('GWIS startDate must not be after endDate');
    }
    if (
      query.minAreaHa !== undefined &&
      (!Number.isFinite(query.minAreaHa) || query.minAreaHa < 0)
    ) {
      throw new RangeError('GWIS minAreaHa must be a non-negative finite number');
    }

    const url = new URL(this.endpoint);
    url.search = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: 'ms:nrt.ba.poly',
      outputFormat: 'application/json; subtype=geojson',
      srsName: 'EPSG:4326',
      FILTER: ogcFilter(query),
    }).toString();

    let body: string;
    try {
      body = await this.transport.getText(url.toString(), {
        signal: query.signal,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('NETWORK', 'Copernicus GWIS request failed', undefined, { cause: error });
    }

    let collection: GwisGeoJsonCollection;
    try {
      collection = JSON.parse(body) as GwisGeoJsonCollection;
    } catch (error) {
      throw new ServiceError('INVALID_RESPONSE', 'GWIS returned invalid GeoJSON', undefined, { cause: error });
    }
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new ServiceError('INVALID_RESPONSE', 'GWIS response is not a GeoJSON FeatureCollection');
    }

    return {
      perimeters: collection.features.map((feature) => perimeter(feature as GwisGeoJsonFeature)),
      area: query.area,
      startDate: query.startDate,
      endDate: query.endDate,
      ...(query.minAreaHa === undefined ? {} : { minAreaHa: query.minAreaHa }),
      product: 'MODIS & VIIRS NRT',
      provider: 'Copernicus GWIS',
    };
  }
}
