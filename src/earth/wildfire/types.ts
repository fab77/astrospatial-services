export const FIRMS_SOURCES = [
  'MODIS_NRT',
  'MODIS_SP',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT',
  'VIIRS_NOAA21_SP',
  'VIIRS_SNPP_NRT',
  'VIIRS_SNPP_SP',
] as const;

export type FirmsSource = (typeof FIRMS_SOURCES)[number];

export type FirmsConfidenceCategory = 'low' | 'nominal' | 'high';

export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface WildfireDetection {
  id: string;
  longitudeDeg: number;
  latitudeDeg: number;
  acquiredAt: string;
  satellite: string;
  instrument: string;
  confidence?: number | FirmsConfidenceCategory;
  fireRadiativePowerMw?: number;
  brightnessKelvin?: number;
  secondaryBrightnessKelvin?: number;
  scanKm?: number;
  trackKm?: number;
  dayNight?: 'day' | 'night';
  version?: string;
  source: FirmsSource;
  provider: 'NASA FIRMS';
}

export interface FirmsAreaQuery {
  source: FirmsSource;
  area: GeographicBoundingBox | 'world';
  dayRange: number;
  startDate?: string;
  signal?: AbortSignal;
}

export interface FirmsAreaResult {
  detections: WildfireDetection[];
  source: FirmsSource;
  area: GeographicBoundingBox | 'world';
  dayRange: number;
  startDate?: string;
  provider: 'NASA FIRMS';
}

export type BurnedAreaGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface BurnedAreaPerimeter {
  id: string;
  fireId: string;
  initialAt: string;
  finalAt: string;
  areaHa: number;
  geometry: BurnedAreaGeometry;
  product: 'MODIS & VIIRS NRT';
  provider: 'Copernicus GWIS';
}

export interface GwisBurnedAreaQuery {
  area: GeographicBoundingBox;
  startDate: string;
  endDate: string;
  minAreaHa?: number;
  signal?: AbortSignal;
}

export interface GwisBurnedAreaResult {
  perimeters: BurnedAreaPerimeter[];
  area: GeographicBoundingBox;
  startDate: string;
  endDate: string;
  minAreaHa?: number;
  product: 'MODIS & VIIRS NRT';
  provider: 'Copernicus GWIS';
}
