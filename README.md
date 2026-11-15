# astrospatial-services

Render-independent TypeScript services for scientific data access across astronomy, Earth observation and planetary applications.

**Status:** active development. Includes CDS Sesame name resolution, Nominatim
Earth place resolution, HiPS discovery and TAP clients.

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

### Live integration

```sh
RUN_LIVE_TESTS=1 npm run test:live
```

Live tests require external CDS availability and are excluded from ordinary CI.

## Roadmap

- Nominatim reverse geocoding and proxy-client integration.
- FIRMS data-availability checks and burnt-area provider integration.
- TAP Async and richer VOTable metadata.
- STAC/OGC Earth observation and planetary/PDS discovery.

## Licensing

Dual-licensed under AGPL-3.0-only or a separate commercial license. See LICENSE.md.
