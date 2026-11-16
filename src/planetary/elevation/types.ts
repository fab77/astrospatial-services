export type PlanetaryBody = 'moon' | 'mars' | 'mercury' | 'venus' | (string & {});

export type ElevationValueType = 'elevation' | 'radius';
export type ElevationInterpolation = 'nearest' | 'bilinear';

export interface EquirectangularGridGeometry {
  westLongitudeRad: number;
  eastLongitudeRad: number;
  northLatitudeRad: number;
  southLatitudeRad: number;
  registration: 'pixel-center' | 'grid-node';
  periodicLongitude: boolean;
}

export interface ElevationMetadata {
  body: PlanetaryBody;
  frame: string;
  latitudeType: 'planetocentric';
  longitudeDirection: 'east';
  longitudeDomain: '0_360';
  verticalDatum: string;
  verticalUnit: 'm';
  referenceRadiusM?: number;
  sourceProductId: string;
  sourceUrl: string;
  version: string;
  checksum?: string;
  citation: string;
}

export interface ElevationSample {
  valid: boolean;
  radiusM?: number;
  elevationM?: number;
}

export interface ElevationSamplingOptions {
  interpolation?: ElevationInterpolation;
}

/**
 * A render-independent planetary elevation field in the canonical 3DHiPS
 * angular convention: planetocentric colatitude and east-positive longitude.
 */
export interface ElevationField {
  readonly metadata: ElevationMetadata;

  sampleDirection(
    thetaRad: number,
    phiRad: number,
    options?: ElevationSamplingOptions,
  ): ElevationSample;
}
