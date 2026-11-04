# Architecture

- `src/core`: transport abstraction, request timeouts, cancellation and typed errors.
- `src/astronomy/name-resolver`: CDS Sesame client and neutral coordinate result.
- Future `src/astronomy/hips`, `src/astronomy/tap`: provider discovery and protocol-specific clients.
- Future Earth observation and planetary modules: add when concrete services are designed.

No dependency on AstroViewer, WebGL, or Astrospatial Core. Consumers decide how to turn returned data into camera movements, CatalogueGL or mesh layers.

Sesame port preserves the legacy `Target -> Resolver -> jradeg/jdedeg` interpretation. Unlike legacy code, network failures are surfaced rather than silently converted into `null`.
