import { ServiceError } from '../../core/ServiceError.js';

export type Pds3Scalar = string | number;
export type Pds3Metadata = Record<string, Pds3Scalar>;

function parseScalar(rawValue: string): Pds3Scalar {
  const withoutUnit = rawValue.replace(/\s*<[^>]+>\s*$/, '').trim();
  if (
    (withoutUnit.startsWith('"') && withoutUnit.endsWith('"')) ||
    (withoutUnit.startsWith("'") && withoutUnit.endsWith("'"))
  ) {
    return withoutUnit.slice(1, -1);
  }
  const numeric = Number(withoutUnit);
  return withoutUnit !== '' && Number.isFinite(numeric) ? numeric : withoutUnit;
}

/** Parse scalar assignments from a PDS3 ODL label, preserving unknown keys. */
export function parsePds3Label(labelText: string): Pds3Metadata {
  if (typeof labelText !== 'string') throw new TypeError('PDS3 label must be text');
  const metadata: Pds3Metadata = {};
  const withoutComments = labelText.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const line of withoutComments.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_^]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !match[2] || match[2].startsWith('{')) continue;
    metadata[match[1]] = parseScalar(match[2]);
  }
  if (metadata.PDS_VERSION_ID !== 'PDS3') {
    throw new ServiceError('INVALID_RESPONSE', 'Label is not PDS3');
  }
  return metadata;
}

export function requirePds3String(metadata: Pds3Metadata, key: string): string {
  const value = metadata[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceError('INVALID_RESPONSE', `Missing or invalid PDS3 ${key}`);
  }
  return value;
}

export function requirePds3Number(metadata: Pds3Metadata, key: string): number {
  const value = metadata[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError('INVALID_RESPONSE', `Missing or invalid PDS3 ${key}`);
  }
  return value;
}
