import { ServiceError } from '../../core/ServiceError.js';
import type {
  FirmsConfidenceCategory,
  FirmsSource,
  WildfireDetection,
} from './types.js';

function invalid(message: string, cause?: unknown): never {
  throw new ServiceError('INVALID_RESPONSE', message, undefined, cause ? { cause } : undefined);
}

function csvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell !== '' || closed) invalid('Malformed FIRMS CSV quoting');
      quoted = true;
    } else if (character === ',') {
      record.push(cell);
      cell = '';
      closed = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      closed = false;
    } else {
      if (closed) invalid('Unexpected characters after FIRMS CSV quote');
      cell += character;
    }
  }

  if (quoted) invalid('Unterminated FIRMS CSV quoted field');
  if (cell !== '' || record.length || closed) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function confidence(value: string | undefined): number | FirmsConfidenceCategory | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'l' || normalized === 'low') return 'low';
  if (normalized === 'n' || normalized === 'nominal') return 'nominal';
  if (normalized === 'h' || normalized === 'high') return 'high';
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function acquisitionTime(date: string | undefined, time: string | undefined): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const compactTime = time?.trim().padStart(4, '0');
  if (!compactTime || !/^\d{4}$/.test(compactTime)) return undefined;
  const hours = Number(compactTime.slice(0, 2));
  const minutes = Number(compactTime.slice(2));
  if (hours > 23 || minutes > 59) return undefined;
  const timestamp = `${date}T${compactTime.slice(0, 2)}:${compactTime.slice(2)}:00Z`;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp.replace('Z', '.000Z')
    ? undefined
    : timestamp;
}

function dayNight(value: string | undefined): 'day' | 'night' | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'D') return 'day';
  if (normalized === 'N') return 'night';
  return undefined;
}

/** Parse NASA FIRMS area-API CSV into render-independent detections. */
export function parseFirmsCsv(csv: string, source: FirmsSource): WildfireDetection[] {
  let records: string[][];
  try {
    records = csvRecords(csv.replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    return invalid('Malformed FIRMS CSV', error);
  }
  if (!records.length) invalid('FIRMS CSV has no header');

  const headers = records[0].map((header) => header.trim().toLowerCase());
  const indexes = new Map(headers.map((header, index) => [header, index]));
  for (const required of ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'instrument']) {
    if (!indexes.has(required)) invalid(`FIRMS CSV is missing required column: ${required}`);
  }
  const value = (row: string[], name: string): string | undefined => {
    const index = indexes.get(name);
    return index === undefined ? undefined : row[index];
  };

  return records.slice(1).flatMap((row): WildfireDetection[] => {
    if (row.length === 1 && row[0].trim() === '') return [];
    if (row.length !== headers.length) return [];
    const latitudeDeg = optionalNumber(value(row, 'latitude'));
    const longitudeDeg = optionalNumber(value(row, 'longitude'));
    const acquiredAt = acquisitionTime(value(row, 'acq_date'), value(row, 'acq_time'));
    const satellite = value(row, 'satellite')?.trim();
    const instrument = value(row, 'instrument')?.trim();
    if (
      latitudeDeg === undefined ||
      latitudeDeg < -90 ||
      latitudeDeg > 90 ||
      longitudeDeg === undefined ||
      longitudeDeg < -180 ||
      longitudeDeg > 180 ||
      !acquiredAt ||
      !satellite ||
      !instrument
    ) return [];

    const detectionConfidence = confidence(value(row, 'confidence'));
    const fireRadiativePowerMw = optionalNumber(value(row, 'frp'));
    const brightnessKelvin = optionalNumber(
      value(row, 'bright_ti4') ?? value(row, 'brightness'),
    );
    const secondaryBrightnessKelvin = optionalNumber(
      value(row, 'bright_ti5') ?? value(row, 'bright_t31'),
    );
    const scanKm = optionalNumber(value(row, 'scan'));
    const trackKm = optionalNumber(value(row, 'track'));
    const observationPeriod = dayNight(value(row, 'daynight'));
    const version = value(row, 'version')?.trim() || undefined;
    const id = [satellite, instrument, acquiredAt, latitudeDeg.toFixed(5), longitudeDeg.toFixed(5)].join(':');

    return [{
      id,
      longitudeDeg,
      latitudeDeg,
      acquiredAt,
      satellite,
      instrument,
      ...(detectionConfidence !== undefined ? { confidence: detectionConfidence } : {}),
      ...(fireRadiativePowerMw !== undefined ? { fireRadiativePowerMw } : {}),
      ...(brightnessKelvin !== undefined ? { brightnessKelvin } : {}),
      ...(secondaryBrightnessKelvin !== undefined ? { secondaryBrightnessKelvin } : {}),
      ...(scanKm !== undefined ? { scanKm } : {}),
      ...(trackKm !== undefined ? { trackKm } : {}),
      ...(observationPeriod ? { dayNight: observationPeriod } : {}),
      ...(version ? { version } : {}),
      source,
      provider: 'NASA FIRMS',
    }];
  });
}
