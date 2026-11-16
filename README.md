# astrospatial-services

Render-independent TypeScript services for scientific data access across astronomy, Earth observation and planetary applications.

**Status:** active development. Includes CDS Sesame name resolution, Nominatim
Earth place resolution, HiPS discovery, TAP clients, wildfire services and
Copernicus emergency-mapping products, plus OpenStreetMap infrastructure
discovery through Overpass.

## Planetary elevation

```ts
import { GridElevationField } from 'astrospatial-services/planetary/elevation';
import { OFFICIAL_ELEVATION_PRODUCTS } from 'astrospatial-services/planetary/catalog';

const product = OFFICIAL_ELEVATION_PRODUCTS.moonLolaLdem64;
const field = new GridElevationField({
  metadata: product.metadata,
  width,
  height,
  values,
  geometry: {
    westLongitudeRad: 0,
    eastLongitudeRad: 2 * Math.PI,
    northLatitudeRad: Math.PI / 2,
    southLatitudeRad: -Math.PI / 2,
    registration: 'pixel-center',
    periodicLongitude: true,
  },
  valueType: 'elevation',
  noDataValue: -32768,
});

const sample = field.sampleDirection(thetaRad, phiRad);
// { valid: true, elevationM, radiusM }
```

Planetary elevation fields use a canonical sampling convention compatible with
HEALPix directions: `theta` is planetocentric colatitude in `[0, PI]` and `phi`
is east-positive longitude, normalized to `[0, 2PI)`. Samples preserve both
elevation relative to the declared vertical datum and absolute radius in metres.

`GridElevationField` accepts an already decoded equirectangular grid with
explicit angular extent, pixel-centre or grid-node registration and periodic or
bounded longitude. It supports global and regional coverage, polar row
clamping, nearest or bilinear interpolation, scale/offset conversion and NoData.
Provider-specific acquisition and additional formats such as GeoTIFF remain
separate adapters; the elevation field itself has no dependency on HEALPix,
rendering or filesystem APIs.

### LOLA PDS3 GDR decoding

```ts
import { decodeLolaGdr } from 'astrospatial-services/planetary/elevation';

const { field, label } = decodeLolaGdr(labelText, imageArrayBuffer, {
  sourceUrl: 'https://pds-geosciences.wustl.edu/.../ldem_64.img',
});
const sample = field.sampleDirection(thetaRad, phiRad);
```

The decoder validates dimensions, encoding and simple-cylindrical projection
from the detached PDS3 label. Signed 16-bit little-endian samples are accessed
directly from the supplied buffer without expanding the complete raster into a
second numeric array. Acquisition remains separate so applications can choose
browser fetch, a Node cache or an offline scientific-data workflow.

### Official product acquisition

```ts
import { PlanetaryElevationService } from 'astrospatial-services/planetary/elevation';

const elevations = new PlanetaryElevationService();
const { product, decoded } = await elevations.load('moon-lro-lola-ldem-64', {
  signal: abortController.signal,
});
const sample = decoded.field.sampleDirection(thetaRad, phiRad);
```

Acquisition reads the detached label first, downloads the binary through a
cancellable transport, verifies catalogued `Content-Length` when provided and
always verifies the final byte length before decoding. Applications handling
large products can inject their own binary transport backed by a cache or
offline asset store.

### Node filesystem cache

```ts
import { PlanetaryElevationService } from 'astrospatial-services/planetary/elevation';
import { CachedBinaryHttpTransport } from 'astrospatial-services/planetary/node';

const elevations = new PlanetaryElevationService({
  binaryTransport: new CachedBinaryHttpTransport({
    cacheDir: '/absolute/path/to/planetary-cache',
  }),
});

const result = await elevations.load('moon-lro-lola-ldem-64');
```

The Node-only transport names cached assets by a SHA-256 hash of their source
URL, validates catalogued byte length before reuse, removes stale partial files,
deduplicates concurrent requests in one process and publishes completed files
through an atomic rename. It is intentionally exported from `planetary/node`
rather than the browser-compatible package root.

Run the opt-in end-to-end LOLA verification with:

```sh
npm run test:planetary-live
```

The first run downloads approximately 531 MB into `.cache/planetary`; later
runs reuse an entry verified against both catalogued size and SHA-256. Set
`PLANETARY_CACHE_DIR` to choose a different location or
`LOLA_LDEM_64_SHA256` to override the curated digest during verification.

## Requirements

Node.js >=22, npm, TypeScript 5.x. ESM package; browser-compatible APIs (`fetch`, `AbortSignal`) with no dependency on AstroViewer.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

## Name resolution

```ts
import { SesameService } from 'astrospatial-services/astronomy/name-resolver';
const resolver = new SesameService();
const target = await resolver.resolve('M51'); // { name, raDeg, decDeg, resolver? } or null
```

`resolve()` returns `null` for an unresolved name. Transport, HTTP, timeout and malformed-response failures throw `ServiceError` with a `code`. Endpoint and transport are injectable; callers may pass an `AbortSignal`.

The XML parser is a small, deliberately limited parser for Sesame's `Target/Resolver/jradeg/jdedeg` response. It is not a general-purpose XML parser; richer Sesame responses or VOTable will require a dedicated parser and fixtures.

## Earth place resolution

```ts
import { NominatimService } from 'astrospatial-services/earth/name-resolver';

const resolver = new NominatimService({
  userAgent: 'My application (contact@example.org)',
});
const places = await resolver.search('Gran Vía, Madrid', { limit: 5 });
```

Results retain geographic coordinates, display label, feature category and
type, importance, bounding box and structured address fields. Blank or short
queries and invalid limits are rejected before making a request. Transport,
endpoint, timeout and caller cancellation are configurable.

Public Nominatim instances require an identifiable application and enforce a
usage policy. Production browser applications should call a compliant
server-side proxy with caching and rate limiting; AstroBrowser's Earth backend
is one such integration point.

## Earth wildfire detections

```ts
import { FirmsService } from 'astrospatial-services/earth/wildfire';

const firms = new FirmsService({
  authentication: { kind: 'map-key', mapKey: process.env.FIRMS_MAP_KEY! },
});
const result = await firms.queryArea({
  source: 'VIIRS_NOAA21_NRT',
  area: { west: -18, south: -35, east: 52, north: 38 },
  dayRange: 5,
  startDate: '2026-08-25',
});
```

`FirmsService` calls the official NASA FIRMS area API and normalises its CSV
records into render-independent fire detections. Coordinates, acquisition time,
satellite, instrument, confidence, brightness, FRP, scan/track dimensions and
day/night metadata are retained when supplied by the selected product.

FIRMS requires a free MAP_KEY. Server-side applications can use `map-key`
authentication directly. Browser applications should use `relay`
authentication with a custom endpoint that injects the key server-side; the key
must not be included in browser code. The client deliberately does not infer
fire incidents, severity, active/extinguished state or burnt-area perimeters
from thermal detections.

### Burnt-area perimeters

```ts
import { GwisBurnedAreaService } from 'astrospatial-services/earth/wildfire';

const gwis = new GwisBurnedAreaService();
const result = await gwis.queryPerimeters({
  area: { west: 11, south: -18, east: 25, north: -4 },
  startDate: '2026-08-25',
  endDate: '2026-08-29',
  minAreaHa: 200,
});
```

`GwisBurnedAreaService` queries the official Copernicus GWIS WFS
`nrt.ba.poly` layer and retains Polygon/MultiPolygon geometry, GWIS fire ID,
initial and final observation times and provider-reported area in hectares.
Spatial, temporal-overlap and optional minimum-area filters are sent to the
provider using OGC Filter Encoding. The product is a near-real-time burnt-area
estimate derived from MODIS and VIIRS; it is distinct from a thermal detection,
an operational incident perimeter or an active/extinguished classification.

## Copernicus emergency mapping

```ts
import { CemsRapidMappingService } from 'astrospatial-services/earth/emergency';

const cems = new CemsRapidMappingService();
const activation = await cems.getActivation('EMSR868');
const latestExtent = await cems.queryFloodLayer({
  activationCode: 'EMSR868',
  areaNumber: 2,
  monitoringNumber: 3,
  kind: 'observed-event',
});
```

`CemsRapidMappingService` reads the public Copernicus EMS Rapid Mapping API,
normalises activation areas, monitoring products, acquisition times,
statistics and official GeoJSON layer links, then downloads a requested flood
layer as a render-independent feature collection. Supported flood products are
observed event, maximum flood extent, flood depth and modelled event.

Observed and maximum extents retain their provider meaning. The service does
not label polygons as active, receded or operationally verified damage unless
the source product explicitly provides that classification.

## OpenStreetMap infrastructure

```ts
import { OpenStreetMapOverpassService } from
  'astrospatial-services/earth/openstreetmap';

const overpass = new OpenStreetMapOverpassService();
const infrastructure = await overpass.queryInfrastructure({
  area: { west: 26.27, south: 41.16, east: 26.34, north: 41.23 },
  categories: ['bridge', 'transport', 'healthcare', 'emergency', 'utility'],
});
```

The service issues a bounded Overpass query and normalises OpenStreetMap nodes,
ways and relations to representative geographic points with their OSM ID,
category, tags and canonical source URL. Supported categories are bridges,
transport, healthcare, emergency response, education, public services and
utilities.

OpenStreetMap describes mapped infrastructure; it does not certify disaster
damage or operational interruption. Applications may intersect these features
with an authoritative hazard layer to derive potential exposure, but must label
that result as an analysis rather than provider-verified impact. Public Overpass
instances are best-effort services, so production applications should use a
proxy/cache, a managed endpoint or a local instance.

### Live integration

```sh
RUN_LIVE_TESTS=1 npm run test:live
```

Live tests require external CDS availability and are excluded from ordinary CI.

## Roadmap

- Nominatim reverse geocoding and proxy-client integration.
- FIRMS data-availability checks and richer GWIS metadata discovery.
- More Copernicus EMS product categories and provider metadata.
- Polygon-aware infrastructure exposure analysis built on CEMS and OSM data.
- TAP Async and richer VOTable metadata.
- STAC/OGC Earth observation and planetary/PDS discovery.

## Licensing

Dual-licensed under AGPL-3.0-only or a separate commercial license. See LICENSE.md.
