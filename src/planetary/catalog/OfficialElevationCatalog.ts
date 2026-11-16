import type { ElevationMetadata } from '../elevation/types.js';

export interface OfficialElevationProduct {
  id: string;
  title: string;
  coverage: 'global' | 'regional';
  pixelScaleM: number;
  metadata: ElevationMetadata;
}

/** Curated records are identifiers and provenance, not downloaded assets. */
export const OFFICIAL_ELEVATION_PRODUCTS = {
  moonLolaLdem64: {
    id: 'moon-lro-lola-ldem-64',
    title: 'LRO LOLA LDEM_64 global shape map',
    coverage: 'global',
    pixelScaleM: 473.802,
    metadata: {
      body: 'moon',
      frame: 'IAU Moon body-fixed',
      latitudeType: 'planetocentric',
      longitudeDirection: 'east',
      longitudeDomain: '0_360',
      verticalDatum: 'LOLA reference sphere',
      verticalUnit: 'm',
      referenceRadiusM: 1_737_400,
      sourceProductId: 'LDEM_64.IMG',
      sourceUrl: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img',
      version: 'LRO-L-LOLA-4-GDR-V1.0',
      citation: 'Lunar Orbiter Laser Altimeter (LOLA) Science Team, LRO LOLA RDR and GDR products, NASA Planetary Data System.',
    },
  },
} as const satisfies Record<string, OfficialElevationProduct>;

export function getOfficialElevationProduct(id: string): OfficialElevationProduct | undefined {
  return Object.values(OFFICIAL_ELEVATION_PRODUCTS).find((product) => product.id === id);
}
