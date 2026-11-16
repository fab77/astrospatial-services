# Changelog

## Unreleased

- Add canonical planetary elevation-field types and a global gridded sampler.
- Add HEALPix direction conversion, seam, pole, NoData and datum handling.
- Add an initial curated record for the official LRO LOLA global product.
- Add detached PDS3 label parsing and zero-copy LOLA LDEM decoding.

## 0.4.0 — 2026-11-15

- Add Copernicus GWIS burnt-area perimeter queries with spatial, temporal and
  minimum-area filtering.
- Add Copernicus EMS Rapid Mapping activation and flood-layer discovery.
- Add bounded OpenStreetMap Overpass infrastructure queries with normalised
  Earth feature metadata.
- Export the new `earth/emergency` and `earth/openstreetmap` entry points and
  extend the `earth/wildfire` API.
- Document the Earth-observation service architecture, browser relay pattern
  and reproducible snapshot workflow.
- Add offline unit coverage for GWIS, CEMS Rapid Mapping and Overpass services.

## 0.1.0-snapshot

- Initial TypeScript ESM package foundation.
- CDS Sesame name resolution and HTTP transport.
- Offline unit tests and optional live test.
