import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
import type {
  CemsFloodLayerKind,
  CemsFloodLayerQuery,
  CemsFloodLayerResult,
  CemsRapidMappingActivation,
  CemsRapidMappingArea,
  CemsRapidMappingLayer,
  CemsRapidMappingProduct,
  EmergencyFeature,
  EmergencyFeatureCollection,
  EmergencyGeometry,
} from './types.js';

const OFFICIAL_CEMS_ENDPOINT =
  'https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/';
const PROVIDER = 'Copernicus EMS Rapid Mapping' as const;

export interface CemsRapidMappingServiceOptions {
  endpoint?: string;
  timeoutMs?: number;
  transport?: HttpTransport;
}

interface ApiLayer {
  name?: unknown;
  json?: unknown;
}

interface ApiProduct {
  id?: unknown;
  type?: unknown;
  monitoringNumber?: unknown;
  images?: unknown;
  stats?: unknown;
  layers?: unknown;
  downloadPath?: unknown;
  version?: unknown;
}

interface ApiArea {
  number?: unknown;
  name?: unknown;
  extent?: unknown;
  products?: unknown;
}

function normalizeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new TypeError(`Invalid CEMS endpoint: ${endpoint}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('CEMS endpoint must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('CEMS endpoint must not contain credentials, query or fragment');
  }
  return url;
}

function activationCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^EMSR\d{3,}$/.test(code)) {
    throw new TypeError('CEMS activationCode must use the EMSR### form');
  }
  return code;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceError('INVALID_RESPONSE', `CEMS ${field} is missing`);
  }
  return value;
}

function optionalIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  // Public CEMS timestamps are UTC even when the JSON omits an explicit zone.
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(zoned);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString();
}

function requiredIso(value: unknown, field: string): string {
  const result = optionalIso(value);
  if (!result) throw new ServiceError('INVALID_RESPONSE', `CEMS ${field} is invalid`);
  return result;
}

function layerKind(name: string): CemsFloodLayerKind | undefined {
  if (name.includes('_observedEvent')) return 'observed-event';
  if (name.includes('_maximumFloodExtent')) return 'maximum-flood-extent';
  if (name.includes('_floodDepth')) return 'flood-depth';
  if (name.includes('_modelledEvent')) return 'modelled-event';
  return undefined;
}

function parseLayer(value: unknown): CemsRapidMappingLayer | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const layer = value as ApiLayer;
  if (typeof layer.name !== 'string' || typeof layer.json !== 'string') return undefined;
  return {
    name: layer.name,
    geoJsonUrl: layer.json,
    ...(layerKind(layer.name) ? { kind: layerKind(layer.name) } : {}),
  };
}

function parseProduct(value: unknown): CemsRapidMappingProduct {
  if (!value || typeof value !== 'object') {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS product is invalid');
  }
  const product = value as ApiProduct;
  const id = Number(product.id);
  const monitoringNumber = Number(product.monitoringNumber);
  if (!Number.isInteger(id) || !Number.isInteger(monitoringNumber) || monitoringNumber < 0) {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS product identifiers are invalid');
  }
  const images = Array.isArray(product.images) ? product.images : [];
  const firstImage = images[0] as { acquisitionTime?: unknown } | undefined;
  const version = product.version && typeof product.version === 'object'
    ? product.version as { deliveryTime?: unknown }
    : undefined;
  const layers = Array.isArray(product.layers)
    ? product.layers.map(parseLayer).filter((item): item is CemsRapidMappingLayer => item !== undefined)
    : [];
  return {
    id,
    type: requiredString(product.type, 'product type'),
    monitoringNumber,
    ...(optionalIso(firstImage?.acquisitionTime) ? { acquiredAt: optionalIso(firstImage?.acquisitionTime) } : {}),
    ...(optionalIso(version?.deliveryTime) ? { deliveredAt: optionalIso(version?.deliveryTime) } : {}),
    ...(product.stats && typeof product.stats === 'object'
      ? { statistics: product.stats as Record<string, unknown> }
      : {}),
    layers,
    ...(typeof product.downloadPath === 'string' && product.downloadPath
      ? { downloadUrl: product.downloadPath }
      : {}),
  };
}

function parseArea(value: unknown): CemsRapidMappingArea {
  if (!value || typeof value !== 'object') {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS area is invalid');
  }
  const area = value as ApiArea;
  const number = Number(area.number);
  if (!Number.isInteger(number) || number <= 0 || !Array.isArray(area.products)) {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS area metadata is invalid');
  }
  return {
    number,
    name: requiredString(area.name, 'area name'),
    extentWkt: requiredString(area.extent, 'area extent'),
    products: area.products.map(parseProduct),
  };
}

function geometry(value: unknown): EmergencyGeometry {
  if (!value || typeof value !== 'object') {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS feature geometry is missing');
  }
  const candidate = value as { type?: unknown; coordinates?: unknown };
  const types = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
  if (!types.has(String(candidate.type)) || !Array.isArray(candidate.coordinates)) {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS feature geometry is invalid');
  }
  return candidate as EmergencyGeometry;
}

function featureCollection(body: string): EmergencyFeatureCollection {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS returned invalid GeoJSON', undefined, { cause: error });
  }
  if (!value || typeof value !== 'object') {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS response is not a GeoJSON FeatureCollection');
  }
  const collection = value as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new ServiceError('INVALID_RESPONSE', 'CEMS response is not a GeoJSON FeatureCollection');
  }
  return {
    type: 'FeatureCollection',
    features: collection.features.map((item): EmergencyFeature => {
      if (!item || typeof item !== 'object') {
        throw new ServiceError('INVALID_RESPONSE', 'CEMS feature is invalid');
      }
      const feature = item as { id?: unknown; geometry?: unknown; properties?: unknown };
      return {
        type: 'Feature',
        ...(typeof feature.id === 'string' || typeof feature.id === 'number' ? { id: feature.id } : {}),
        geometry: geometry(feature.geometry),
        properties: feature.properties && typeof feature.properties === 'object'
          ? feature.properties as Record<string, unknown>
          : {},
      };
    }),
  };
}

/** Client for public Copernicus EMS Rapid Mapping activation and product data. */
export class CemsRapidMappingService {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: CemsRapidMappingServiceOptions = {}) {
    this.endpoint = normalizeEndpoint(options.endpoint ?? OFFICIAL_CEMS_ENDPOINT);
    this.timeoutMs = options.timeoutMs ?? 60000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.transport = options.transport ?? new FetchHttpTransport();
  }

  async getActivation(codeInput: string, signal?: AbortSignal): Promise<CemsRapidMappingActivation> {
    const code = activationCode(codeInput);
    const url = new URL(this.endpoint);
    url.searchParams.set('code', code);
    const body = await this.transport.getText(url.toString(), { signal, timeoutMs: this.timeoutMs });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      throw new ServiceError('INVALID_RESPONSE', 'CEMS returned invalid JSON', undefined, { cause: error });
    }
    const results = payload && typeof payload === 'object'
      ? (payload as { results?: unknown }).results
      : undefined;
    if (!Array.isArray(results) || results.length !== 1 || !results[0] || typeof results[0] !== 'object') {
      throw new ServiceError('INVALID_RESPONSE', `CEMS activation ${code} was not found`);
    }
    const activation = results[0] as Record<string, unknown>;
    if (!Array.isArray(activation.aois)) {
      throw new ServiceError('INVALID_RESPONSE', 'CEMS activation areas are missing');
    }
    const countries = Array.isArray(activation.countries)
      ? activation.countries.map((country) => {
          if (typeof country === 'string') return country;
          if (country && typeof country === 'object') return String((country as { name?: unknown }).name ?? '');
          return '';
        }).filter(Boolean)
      : [];
    return {
      code: requiredString(activation.code, 'activation code'),
      name: requiredString(activation.name, 'activation name'),
      category: requiredString(activation.category, 'activation category'),
      ...(typeof activation.subCategory === 'string' && activation.subCategory
        ? { subCategory: activation.subCategory }
        : {}),
      eventAt: requiredIso(activation.eventTime, 'eventTime'),
      activatedAt: requiredIso(activation.activationTime, 'activationTime'),
      countries,
      ...(typeof activation.reason === 'string' && activation.reason
        ? { reason: activation.reason }
        : {}),
      areas: activation.aois.map(parseArea),
      provider: PROVIDER,
    };
  }

  async queryFloodLayer(query: CemsFloodLayerQuery): Promise<CemsFloodLayerResult> {
    if (!query) throw new TypeError('CEMS flood-layer query is required');
    if (!Number.isInteger(query.areaNumber) || query.areaNumber <= 0) {
      throw new RangeError('CEMS areaNumber must be a positive integer');
    }
    if (!Number.isInteger(query.monitoringNumber) || query.monitoringNumber < 0) {
      throw new RangeError('CEMS monitoringNumber must be a non-negative integer');
    }
    const activation = await this.getActivation(query.activationCode, query.signal);
    const area = activation.areas.find((candidate) => candidate.number === query.areaNumber);
    const product = area?.products.find(
      (candidate) => candidate.monitoringNumber === query.monitoringNumber,
    );
    const layer = product?.layers.find((candidate) => candidate.kind === query.kind);
    if (!area || !product || !layer) {
      throw new ServiceError(
        'INVALID_RESPONSE',
        `CEMS ${activation.code} has no ${query.kind} layer for AOI ${query.areaNumber}, monitoring ${query.monitoringNumber}`,
      );
    }
    const body = await this.transport.getText(layer.geoJsonUrl, {
      signal: query.signal,
      timeoutMs: this.timeoutMs,
    });
    return {
      activationCode: activation.code,
      areaNumber: area.number,
      areaName: area.name,
      monitoringNumber: product.monitoringNumber,
      ...(product.acquiredAt ? { acquiredAt: product.acquiredAt } : {}),
      kind: query.kind,
      data: featureCollection(body),
      ...(product.statistics ? { statistics: product.statistics } : {}),
      provider: PROVIDER,
    };
  }
}
