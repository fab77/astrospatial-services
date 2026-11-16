import { ServiceError } from '../../core/ServiceError.js';
import { GridElevationField, type NumericGridValueReader } from './GridElevationField.js';
import {
  parsePds3Label,
  requirePds3Number,
  requirePds3String,
  type Pds3Metadata,
} from './Pds3Label.js';
import type { ElevationMetadata } from './types.js';

export interface LolaGdrDecoderOptions {
  sourceUrl?: string;
  checksum?: string;
  citation?: string;
}

export interface DecodedLolaGdr {
  field: GridElevationField;
  label: Pds3Metadata;
  width: number;
  height: number;
}

class Int16DataView implements NumericGridValueReader {
  readonly length: number;
  private readonly view: DataView;

  constructor(buffer: ArrayBuffer, byteOffset: number, byteLength: number) {
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.length = byteLength / 2;
  }

  get(index: number): number {
    return this.view.getInt16(index * 2, true);
  }
}

function asBufferWindow(data: ArrayBuffer | ArrayBufferView): {
  buffer: ArrayBuffer;
  byteOffset: number;
  byteLength: number;
} {
  if (data instanceof ArrayBuffer) {
    return { buffer: data, byteOffset: 0, byteLength: data.byteLength };
  }
  return {
    buffer: data.buffer as ArrayBuffer,
    byteOffset: data.byteOffset,
    byteLength: data.byteLength,
  };
}

/** Decode a cylindrical LOLA LDEM PDS3 IMG without copying its sample array. */
export function decodeLolaGdr(
  labelText: string,
  imageData: ArrayBuffer | ArrayBufferView,
  options: LolaGdrDecoderOptions = {},
): DecodedLolaGdr {
  const label = parsePds3Label(labelText);
  const dataSetId = requirePds3String(label, 'DATA_SET_ID');
  const productId = requirePds3String(label, 'PRODUCT_ID');
  const fileName = requirePds3String(label, 'FILE_NAME');
  const sampleType = requirePds3String(label, 'SAMPLE_TYPE');
  const projection = requirePds3String(label, 'MAP_PROJECTION_TYPE');
  const longitudeDirection = requirePds3String(label, 'POSITIVE_LONGITUDE_DIRECTION');
  const coordinateSystem = requirePds3String(label, 'COORDINATE_SYSTEM_NAME');
  const width = requirePds3Number(label, 'LINE_SAMPLES');
  const height = requirePds3Number(label, 'LINES');
  const sampleBits = requirePds3Number(label, 'SAMPLE_BITS');
  const scalingFactor = requirePds3Number(label, 'SCALING_FACTOR');
  const referenceRadiusM = requirePds3Number(label, 'OFFSET');
  const westDeg = requirePds3Number(label, 'WESTERNMOST_LONGITUDE');
  const eastDeg = requirePds3Number(label, 'EASTERNMOST_LONGITUDE');
  const northDeg = requirePds3Number(label, 'MAXIMUM_LATITUDE');
  const southDeg = requirePds3Number(label, 'MINIMUM_LATITUDE');

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ServiceError('INVALID_RESPONSE', 'Invalid LOLA raster dimensions');
  }
  if (sampleType !== 'LSB_INTEGER' || sampleBits !== 16) {
    throw new ServiceError('NOT_IMPLEMENTED', `Unsupported LOLA sample encoding: ${sampleType}/${sampleBits}`);
  }
  if (projection !== 'SIMPLE CYLINDRICAL' || longitudeDirection !== 'EAST') {
    throw new ServiceError('NOT_IMPLEMENTED', `Unsupported LOLA projection: ${projection}/${longitudeDirection}`);
  }
  const window = asBufferWindow(imageData);
  const expectedBytes = width * height * 2;
  if (window.byteLength !== expectedBytes) {
    throw new ServiceError(
      'INVALID_RESPONSE',
      `LOLA IMG byte length ${window.byteLength} does not match expected ${expectedBytes}`,
    );
  }

  const metadata: ElevationMetadata = {
    body: 'moon',
    frame: coordinateSystem,
    latitudeType: 'planetocentric',
    longitudeDirection: 'east',
    longitudeDomain: '0_360',
    verticalDatum: `reference sphere ${referenceRadiusM} m`,
    verticalUnit: 'm',
    referenceRadiusM,
    sourceProductId: fileName,
    sourceUrl: options.sourceUrl ?? `pds:${dataSetId}/${productId}`,
    version: String(label.PRODUCT_VERSION_ID ?? dataSetId),
    ...(options.checksum ? { checksum: options.checksum } : {}),
    citation: options.citation ?? 'Lunar Orbiter Laser Altimeter (LOLA) Science Team, NASA Planetary Data System.',
  };
  const field = new GridElevationField({
    metadata,
    width,
    height,
    values: new Int16DataView(window.buffer, window.byteOffset, window.byteLength),
    geometry: {
      westLongitudeRad: westDeg * Math.PI / 180,
      eastLongitudeRad: eastDeg * Math.PI / 180,
      northLatitudeRad: northDeg * Math.PI / 180,
      southLatitudeRad: southDeg * Math.PI / 180,
      registration: 'pixel-center',
      periodicLongitude: Math.abs(eastDeg - westDeg - 360) < 1e-9,
    },
    valueType: 'elevation',
    interpolation: 'bilinear',
    scale: scalingFactor,
  });
  return { field, label, width, height };
}
