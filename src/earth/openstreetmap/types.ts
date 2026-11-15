export interface OpenStreetMapBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type OpenStreetMapInfrastructureCategory =
  | 'bridge'
  | 'transport'
  | 'healthcare'
  | 'emergency'
  | 'education'
  | 'public-service'
  | 'utility'
  | 'poi';

export interface OpenStreetMapInfrastructureQuery {
  area: OpenStreetMapBoundingBox;
  categories: OpenStreetMapInfrastructureCategory[];
  signal?: AbortSignal;
}

export interface OpenStreetMapInfrastructureFeature {
  id: string;
  osmType: 'node' | 'way' | 'relation';
  longitudeDeg: number;
  latitudeDeg: number;
  name?: string;
  category: OpenStreetMapInfrastructureCategory;
  tags: Record<string, string>;
  sourceUrl: string;
  provider: 'OpenStreetMap';
}

export interface OpenStreetMapInfrastructureResult {
  area: OpenStreetMapBoundingBox;
  categories: OpenStreetMapInfrastructureCategory[];
  features: OpenStreetMapInfrastructureFeature[];
  queriedAt: string;
  provider: 'OpenStreetMap';
  service: 'Overpass API';
}
