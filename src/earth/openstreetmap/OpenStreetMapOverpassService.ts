import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
import type {
  OpenStreetMapBoundingBox,
  OpenStreetMapInfrastructureCategory,
  OpenStreetMapInfrastructureFeature,
  OpenStreetMapInfrastructureQuery,
  OpenStreetMapInfrastructureResult,
} from './types.js';

const DEFAULT_ENDPOINT = 'https://overpass.private.coffee/api/interpreter';
const PROVIDER = 'OpenStreetMap' as const;

export interface OpenStreetMapOverpassServiceOptions {
  endpoint?: string;
  timeoutMs?: number;
  transport?: HttpTransport;
}

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: unknown;
};

const selectors: Record<OpenStreetMapInfrastructureCategory, readonly string[]> = {
  bridge: ['nwr["bridge"]["bridge"!="no"]'],
  transport: [
    'nwr["railway"~"^(station|halt|tram_stop)$"]',
    'nwr["public_transport"~"^(station|stop_position)$"]',
    'nwr["highway"~"^(bus_stop|motorway_junction)$"]',
  ],
  healthcare: ['nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]'],
  emergency: [
    'nwr["amenity"~"^(fire_station|police|ambulance_station)$"]',
    'nwr["emergency"~"^(ambulance_station|assembly_point)$"]',
  ],
  education: ['nwr["amenity"~"^(school|kindergarten|college|university)$"]'],
  'public-service': [
    'nwr["amenity"~"^(townhall|community_centre|social_facility|post_office)$"]',
  ],
  utility: [
    'nwr["power"="substation"]',
    'nwr["man_made"~"^(water_works|wastewater_plant|pumping_station)$"]',
  ],
  poi: [
    'nwr["amenity"]',
    'nwr["shop"]',
    'nwr["tourism"]',
    'nwr["office"]',
    'nwr["craft"]',
    'nwr["leisure"]',
    'nwr["historic"]',
    'nwr["building"]',
  ],
};

function normalizeEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new TypeError(`Invalid Overpass endpoint: ${value}`);
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new TypeError('Overpass endpoint must use HTTP or HTTPS');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError('Overpass endpoint must not contain credentials, query or fragment');
  }
  return endpoint;
}

function validateArea(area: OpenStreetMapBoundingBox): OpenStreetMapBoundingBox {
  if (!area) throw new TypeError('OpenStreetMap area is required');
  const { west, south, east, north } = area;
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new TypeError('OpenStreetMap area coordinates must be finite');
  }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    throw new RangeError('OpenStreetMap area coordinates are outside longitude/latitude limits');
  }
  if (west >= east || south >= north) {
    throw new RangeError('OpenStreetMap area must have west < east and south < north');
  }
  return { west, south, east, north };
}

function uniqueCategories(
  categories: OpenStreetMapInfrastructureCategory[],
): OpenStreetMapInfrastructureCategory[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new TypeError('At least one OpenStreetMap infrastructure category is required');
  }
  for (const category of categories) {
    if (!(category in selectors)) {
      throw new TypeError(`Unsupported OpenStreetMap infrastructure category: ${String(category)}`);
    }
  }
  return [...new Set(categories)];
}

function buildQuery(
  area: OpenStreetMapBoundingBox,
  categories: OpenStreetMapInfrastructureCategory[],
): string {
  const bbox = `${area.south},${area.west},${area.north},${area.east}`;
  const clauses = categories.flatMap((category) =>
    selectors[category].map((selector) => `${selector}(${bbox});`),
  );
  return `[out:json][timeout:45];(${clauses.join('')});out center tags;`;
}

function stringTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
      .map(([key, item]) => [key, String(item)]),
  );
}

function categoryFromTags(tags: Record<string, string>): OpenStreetMapInfrastructureCategory {
  if (tags.bridge && tags.bridge !== 'no') return 'bridge';
  if (tags.railway || tags.public_transport || tags.highway) return 'transport';
  if (/^(hospital|clinic|doctors|pharmacy)$/.test(tags.amenity ?? '')) return 'healthcare';
  if (/^(fire_station|police|ambulance_station)$/.test(tags.amenity ?? '') || tags.emergency) {
    return 'emergency';
  }
  if (/^(school|kindergarten|college|university)$/.test(tags.amenity ?? '')) return 'education';
  if (/^(townhall|community_centre|social_facility|post_office)$/.test(tags.amenity ?? '')) {
    return 'public-service';
  }
  if (tags.power || tags.man_made) return 'utility';
  return 'poi';
}

function parseResponse(body: string): OpenStreetMapInfrastructureFeature[] {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new ServiceError('INVALID_RESPONSE', 'Overpass returned invalid JSON', undefined, { cause: error });
  }
  const elements = payload && typeof payload === 'object'
    ? (payload as { elements?: unknown }).elements
    : undefined;
  if (!Array.isArray(elements)) {
    throw new ServiceError('INVALID_RESPONSE', 'Overpass response has no elements array');
  }

  const seen = new Set<string>();
  return elements.flatMap((value): OpenStreetMapInfrastructureFeature[] => {
    if (!value || typeof value !== 'object') return [];
    const element = value as OverpassElement;
    const osmType = element.type;
    const id = Number(element.id);
    if ((osmType !== 'node' && osmType !== 'way' && osmType !== 'relation') || !Number.isInteger(id)) {
      return [];
    }
    const longitudeDeg = Number(osmType === 'node' ? element.lon : element.center?.lon);
    const latitudeDeg = Number(osmType === 'node' ? element.lat : element.center?.lat);
    if (!Number.isFinite(longitudeDeg) || !Number.isFinite(latitudeDeg)) return [];
    const key = `${osmType}/${id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const tags = stringTags(element.tags);
    const name = tags.name || tags['name:en'] || tags.ref;
    return [{
      id: key,
      osmType,
      longitudeDeg,
      latitudeDeg,
      ...(name ? { name } : {}),
      category: categoryFromTags(tags),
      tags,
      sourceUrl: `https://www.openstreetmap.org/${osmType}/${id}`,
      provider: PROVIDER,
    }];
  });
}

/** Query globally recognised OpenStreetMap infrastructure through Overpass API. */
export class OpenStreetMapOverpassService {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: OpenStreetMapOverpassServiceOptions = {}) {
    this.endpoint = normalizeEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.transport = options.transport ?? new FetchHttpTransport();
  }

  async queryInfrastructure(
    query: OpenStreetMapInfrastructureQuery,
  ): Promise<OpenStreetMapInfrastructureResult> {
    if (!query) throw new TypeError('OpenStreetMap infrastructure query is required');
    const area = validateArea(query.area);
    const categories = uniqueCategories(query.categories);
    const overpassQuery = buildQuery(area, categories);
    const requestOptions = { signal: query.signal, timeoutMs: this.timeoutMs };
    const body = this.transport.request
      ? await this.transport.request(this.endpoint.toString(), {
          ...requestOptions,
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': 'astrospatial-services',
          },
          body: new URLSearchParams({ data: overpassQuery }).toString(),
        }).then((response) => response.body)
      : await this.transport.getText(
          `${this.endpoint.toString()}?${new URLSearchParams({ data: overpassQuery })}`,
          requestOptions,
        );
    return {
      area,
      categories,
      features: parseResponse(body),
      queriedAt: new Date().toISOString(),
      provider: PROVIDER,
      service: 'Overpass API',
    };
  }
}
