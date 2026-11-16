import { healpixDirectionToCanonical } from './coordinates.js';
import type {
  ElevationField,
  ElevationInterpolation,
  ElevationMetadata,
  ElevationSample,
  ElevationSamplingOptions,
  ElevationValueType,
  EquirectangularGridGeometry,
} from './types.js';

export interface GridElevationFieldOptions {
  metadata: ElevationMetadata;
  width: number;
  height: number;
  values: NumericGridValues;
  geometry: EquirectangularGridGeometry;
  valueType: ElevationValueType;
  interpolation?: ElevationInterpolation;
  noDataValue?: number;
  scale?: number;
  offset?: number;
}

export interface NumericGridValueReader {
  readonly length: number;
  get(index: number): number;
}

export type NumericGridValues = ArrayLike<number> | NumericGridValueReader;

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

/** An explicitly georeferenced, north-to-south equirectangular elevation grid. */
export class GridElevationField implements ElevationField {
  readonly metadata: ElevationMetadata;
  private readonly width: number;
  private readonly height: number;
  private readonly values: NumericGridValues;
  private readonly geometry: EquirectangularGridGeometry;
  private readonly valueType: ElevationValueType;
  private readonly interpolation: ElevationInterpolation;
  private readonly noDataValue?: number;
  private readonly scale: number;
  private readonly offset: number;

  constructor(options: GridElevationFieldOptions) {
    requirePositiveInteger(options.width, 'width');
    requirePositiveInteger(options.height, 'height');
    if (options.values.length !== options.width * options.height) {
      throw new RangeError('values length must equal width * height');
    }
    const geometry = options.geometry;
    for (const [name, value] of Object.entries(geometry)) {
      if (name !== 'registration' && name !== 'periodicLongitude') {
        requireFinite(value as number, name);
      }
    }
    const longitudeSpan = geometry.eastLongitudeRad - geometry.westLongitudeRad;
    const latitudeSpan = geometry.northLatitudeRad - geometry.southLatitudeRad;
    if (longitudeSpan <= 0 || longitudeSpan > 2 * Math.PI + Number.EPSILON) {
      throw new RangeError('grid longitude extent must be in (0, 2PI]');
    }
    if (
      latitudeSpan <= 0 ||
      geometry.southLatitudeRad < -Math.PI / 2 ||
      geometry.northLatitudeRad > Math.PI / 2
    ) {
      throw new RangeError('grid latitude extent must be ordered within [-PI/2, PI/2]');
    }
    if (geometry.periodicLongitude && Math.abs(longitudeSpan - 2 * Math.PI) > 1e-12) {
      throw new RangeError('periodic longitude requires a full 2PI extent');
    }
    if (geometry.registration === 'grid-node' && (options.width < 2 || options.height < 2)) {
      throw new RangeError('grid-node registration requires width and height >= 2');
    }
    if (options.valueType === 'elevation' && options.metadata.referenceRadiusM === undefined) {
      throw new TypeError('referenceRadiusM is required for elevation values');
    }
    if (options.metadata.referenceRadiusM !== undefined) {
      requireFinite(options.metadata.referenceRadiusM, 'referenceRadiusM');
    }
    this.scale = options.scale ?? 1;
    this.offset = options.offset ?? 0;
    requireFinite(this.scale, 'scale');
    requireFinite(this.offset, 'offset');
    this.metadata = options.metadata;
    this.width = options.width;
    this.height = options.height;
    this.values = options.values;
    this.geometry = { ...geometry };
    this.valueType = options.valueType;
    this.interpolation = options.interpolation ?? 'bilinear';
    this.noDataValue = options.noDataValue;
  }

  sampleDirection(
    thetaRad: number,
    phiRad: number,
    options: ElevationSamplingOptions = {},
  ): ElevationSample {
    const { latitudeRad, longitudeRad } = healpixDirectionToCanonical(thetaRad, phiRad);
    const position = this.gridPosition(latitudeRad, longitudeRad);
    if (!position) return { valid: false };
    const { x, y } = position;
    const interpolation = options.interpolation ?? this.interpolation;
    const value = interpolation === 'nearest'
      ? this.sampleNearest(x, y)
      : this.sampleBilinear(x, y);
    if (value === undefined) return { valid: false };
    return this.toSample(value * this.scale + this.offset);
  }

  private gridPosition(latitudeRad: number, longitudeRad: number): { x: number; y: number } | undefined {
    const geometry = this.geometry;
    const longitudeSpan = geometry.eastLongitudeRad - geometry.westLongitudeRad;
    const latitudeSpan = geometry.northLatitudeRad - geometry.southLatitudeRad;
    let longitudeOffset = longitudeRad - geometry.westLongitudeRad;
    if (geometry.periodicLongitude) {
      longitudeOffset = ((longitudeOffset % longitudeSpan) + longitudeSpan) % longitudeSpan;
    } else if (longitudeOffset < 0 || longitudeOffset > longitudeSpan) {
      return undefined;
    }
    if (latitudeRad < geometry.southLatitudeRad || latitudeRad > geometry.northLatitudeRad) {
      return undefined;
    }
    if (geometry.registration === 'grid-node') {
      return {
        x: longitudeOffset / longitudeSpan * (this.width - 1),
        y: (geometry.northLatitudeRad - latitudeRad) / latitudeSpan * (this.height - 1),
      };
    }
    return {
      x: longitudeOffset / longitudeSpan * this.width - 0.5,
      y: (geometry.northLatitudeRad - latitudeRad) / latitudeSpan * this.height - 0.5,
    };
  }

  private sampleNearest(x: number, y: number): number | undefined {
    return this.read(Math.round(x), Math.round(y));
  }

  private sampleBilinear(x: number, y: number): number | undefined {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const samples = [
      { value: this.read(x0, y0), weight: (1 - tx) * (1 - ty) },
      { value: this.read(x0 + 1, y0), weight: tx * (1 - ty) },
      { value: this.read(x0, y0 + 1), weight: (1 - tx) * ty },
      { value: this.read(x0 + 1, y0 + 1), weight: tx * ty },
    ];
    let weighted = 0;
    let totalWeight = 0;
    for (const sample of samples) {
      if (sample.value === undefined || sample.weight === 0) continue;
      weighted += sample.value * sample.weight;
      totalWeight += sample.weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : undefined;
  }

  private read(column: number, row: number): number | undefined {
    const wrappedColumn = this.geometry.periodicLongitude
      ? ((column % this.width) + this.width) % this.width
      : column;
    if (wrappedColumn < 0 || wrappedColumn >= this.width || row < 0 || row >= this.height) {
      if (this.geometry.registration === 'grid-node') return undefined;
    }
    const clampedRow = Math.max(0, Math.min(this.height - 1, row));
    const clampedColumn = Math.max(0, Math.min(this.width - 1, wrappedColumn));
    const index = clampedRow * this.width + clampedColumn;
    const rawValue = 'get' in this.values
      ? this.values.get(index)
      : this.values[index];
    const value = Number(rawValue);
    if (!Number.isFinite(value) || Object.is(value, this.noDataValue)) return undefined;
    return value;
  }

  private toSample(valueM: number): ElevationSample {
    if (this.valueType === 'radius') {
      const referenceRadiusM = this.metadata.referenceRadiusM;
      return {
        valid: true,
        radiusM: valueM,
        ...(referenceRadiusM === undefined ? {} : { elevationM: valueM - referenceRadiusM }),
      };
    }
    return {
      valid: true,
      elevationM: valueM,
      radiusM: this.metadata.referenceRadiusM! + valueM,
    };
  }
}
