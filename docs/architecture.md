# Architecture

- `src/core`: text and binary transport abstractions, request timeouts,
  cancellation, response-size checks and typed errors.
- `src/astronomy/name-resolver`: CDS Sesame client and neutral coordinate result.
- `src/earth/wildfire`: NASA FIRMS thermal detections and Copernicus GWIS
  near-real-time burnt-area perimeters, both exposed as neutral provider models.
- `src/earth/emergency`: Copernicus EMS Rapid Mapping activations, monitoring
  products, statistics and official GeoJSON emergency layers.
- `src/earth/openstreetmap`: bounded Overpass infrastructure discovery with
  neutral OSM feature metadata and no inferred damage classification.
- `src/planetary/elevation`: canonical planetocentric elevation fields sampled
  by HEALPix-compatible `theta`/`phi` directions, independent of rendering and
  source-file formats; includes PDS3/LOLA decoding and catalog-driven
  acquisition through injectable transports.
- `src/planetary/catalog`: curated identifiers and provenance for official
  planetary elevation products. Catalog entries do not imply that an asset has
  been downloaded or decoded.
- Future `src/astronomy/hips`, `src/astronomy/tap`: provider discovery and protocol-specific clients.
- Future Earth observation and planetary modules: add when concrete services are designed.

No dependency on AstroViewer or WebGL. Consumers decide how to turn returned
data into camera movements, CatalogueGL or mesh layers. Planetary provider
adapters are responsible for converting source coordinates, units and vertical
datums into the canonical elevation-field contract; mesh generation remains a
consumer concern. Large-product caching and filesystem persistence are also
consumer concerns and can be implemented through an injected binary transport.
The optional `src/planetary/node` entry point provides an atomic filesystem
cache and is never exported from the browser-compatible package root.

Provider clients preserve source measurements and provenance. Application-level
classification such as severity, fire-event clustering, active/extinguished
state or inferred flood recession remains outside this package unless backed
directly by a provider field.

Sesame port preserves the legacy `Target -> Resolver -> jradeg/jdedeg` interpretation. Unlike legacy code, network failures are surfaced rather than silently converted into `null`.
