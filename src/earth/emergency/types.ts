export type GeoJsonPosition = number[];

export type EmergencyGeometry =
  | { type: 'Point'; coordinates: GeoJsonPosition }
  | { type: 'MultiPoint'; coordinates: GeoJsonPosition[] }
  | { type: 'LineString'; coordinates: GeoJsonPosition[] }
  | { type: 'MultiLineString'; coordinates: GeoJsonPosition[][] }
  | { type: 'Polygon'; coordinates: GeoJsonPosition[][] }
  | { type: 'MultiPolygon'; coordinates: GeoJsonPosition[][][] };

export interface EmergencyFeature {
  type: 'Feature';
  id?: string | number;
  geometry: EmergencyGeometry;
  properties: Record<string, unknown>;
}

export interface EmergencyFeatureCollection {
  type: 'FeatureCollection';
  features: EmergencyFeature[];
}

export interface CemsRapidMappingLayer {
  name: string;
  geoJsonUrl: string;
  kind?: CemsFloodLayerKind;
}

export interface CemsRapidMappingProduct {
  id: number;
  type: string;
  monitoringNumber: number;
  acquiredAt?: string;
  deliveredAt?: string;
  statistics?: Record<string, unknown>;
  layers: CemsRapidMappingLayer[];
  downloadUrl?: string;
}

export interface CemsRapidMappingArea {
  number: number;
  name: string;
  extentWkt: string;
  products: CemsRapidMappingProduct[];
}

export interface CemsRapidMappingActivation {
  code: string;
  name: string;
  category: string;
  subCategory?: string;
  eventAt: string;
  activatedAt: string;
  countries: string[];
  reason?: string;
  areas: CemsRapidMappingArea[];
  provider: 'Copernicus EMS Rapid Mapping';
}

export type CemsFloodLayerKind =
  | 'observed-event'
  | 'maximum-flood-extent'
  | 'flood-depth'
  | 'modelled-event';

export interface CemsFloodLayerQuery {
  activationCode: string;
  areaNumber: number;
  monitoringNumber: number;
  kind: CemsFloodLayerKind;
  signal?: AbortSignal;
}

export interface CemsFloodLayerResult {
  activationCode: string;
  areaNumber: number;
  areaName: string;
  monitoringNumber: number;
  acquiredAt?: string;
  kind: CemsFloodLayerKind;
  data: EmergencyFeatureCollection;
  statistics?: Record<string, unknown>;
  provider: 'Copernicus EMS Rapid Mapping';
}
