# Architecture

- `src/core`: transport abstraction, request timeouts, cancellation and typed errors.
- `src/astronomy/name-resolver`: CDS Sesame client and neutral coordinate result.
- `src/earth/wildfire`: NASA FIRMS thermal detections and Copernicus GWIS
  near-real-time burnt-area perimeters, both exposed as neutral provider models.
- `src/earth/emergency`: Copernicus EMS Rapid Mapping activations, monitoring
  products, statistics and official GeoJSON emergency layers.
- `src/earth/openstreetmap`: bounded Overpass infrastructure discovery with
  neutral OSM feature metadata and no inferred damage classification.
- Future `src/astronomy/hips`, `src/astronomy/tap`: provider discovery and protocol-specific clients.
- Future Earth observation and planetary modules: add when concrete services are designed.

No dependency on AstroViewer, WebGL, or Astrospatial Core. Consumers decide how to turn returned data into camera movements, CatalogueGL or mesh layers.

Provider clients preserve source measurements and provenance. Application-level
classification such as severity, fire-event clustering, active/extinguished
state or inferred flood recession remains outside this package unless backed
directly by a provider field.

Sesame port preserves the legacy `Target -> Resolver -> jradeg/jdedeg` interpretation. Unlike legacy code, network failures are surfaced rather than silently converted into `null`.
