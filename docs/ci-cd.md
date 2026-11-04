# CI/CD

Workflow templates copied from astrospatial-core's supplied archive, which follows the AstroViewer release model:
- CI on push (`main`, `dev`, `feature/**`, `release/**`) and PR to `main`/`dev`.
- `npm ci`, `npm test` (includes build), `npm pack --dry-run`.
- Release only on `v*` tags; check tag matches package version; npm Trusted Publishing OIDC.
- npm trusted publisher must be configured for this exact repository/workflow before release.
- For release, set package version to stable `0.1.0` before tagging `v0.1.0`.
- No npm publish was performed in this scaffold.
