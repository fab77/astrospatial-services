const TWO_PI = 2 * Math.PI;

export interface CanonicalPlanetaryCoordinates {
  latitudeRad: number;
  longitudeRad: number;
}

export function normalizeEastLongitudeRad(longitudeRad: number): number {
  if (!Number.isFinite(longitudeRad)) {
    throw new RangeError('longitudeRad must be finite');
  }
  const normalized = longitudeRad % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

export function healpixDirectionToCanonical(
  thetaRad: number,
  phiRad: number,
): CanonicalPlanetaryCoordinates {
  if (!Number.isFinite(thetaRad) || thetaRad < 0 || thetaRad > Math.PI) {
    throw new RangeError('thetaRad must be finite and between 0 and PI');
  }
  return {
    latitudeRad: Math.PI / 2 - thetaRad,
    longitudeRad: normalizeEastLongitudeRad(phiRad),
  };
}
