# astrospatial-services

Render-independent TypeScript services for scientific data access across astronomy, Earth observation and planetary applications.

**Status:** 0.1.0-snapshot; foundation and CDS Sesame name resolution only. TAP and HiPS discovery are planned, **not implemented**.

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

### Live integration

```sh
RUN_LIVE_TESTS=1 npm run test:live
```

Live tests require external CDS availability and are excluded from ordinary CI.

## Roadmap

- HiPS node discovery and `hipslist`/`properties` parsing, independent of AstroViewer's `HiPSDescriptor`.
- TAP Sync/ADQL with typed tabular results, then TAP Async and VOTable metadata.
- Later: STAC/OGC Earth observation and planetary/PDS discovery.

## Licensing

Dual-licensed under AGPL-3.0-only or a separate commercial license. See LICENSE.md.
