# Architecture

- `src/core`: transport abstraction, request timeouts, cancellation and typed errors.
- `src/astronomy/name-resolver`: CDS Sesame client and neutral coordinate result.
- `src/earth/wildfire`: NASA FIRMS client and neutral thermal-detection model.
- Future `src/astronomy/hips`, `src/astronomy/tap`: provider discovery and protocol-specific clients.
- Future Earth observation and planetary modules: add when concrete services are designed.

No dependency on AstroViewer, WebGL, or Astrospatial Core. Consumers decide how to turn returned data into camera movements, CatalogueGL or mesh layers.

Provider clients preserve source measurements and provenance. Application-level
classification such as severity, fire-event clustering or active/extinguished
state remains outside this package unless backed directly by a provider field.

Sesame port preserves the legacy `Target -> Resolver -> jradeg/jdedeg` interpretation. Unlike legacy code, network failures are surfaced rather than silently converted into `null`.
