# @idevconn/company-registry

## 0.1.0

### Minor Changes

- 3a39106: Initial release. Server-side company lookup by name in national business registries: adapters for Israel, Norway, Finland, France, Czechia, the United Kingdom, Australia, New Zealand, Switzerland and OpenCorporates (US, Canada, Poland), a GLEIF fallback for every other country, credentials read from options or env and never exposed, typed `CompanyRegistryError`s, and an opt-in NestJS module (`@idevconn/company-registry/nestjs`) with an injectable service and an optional controller that takes your guards.
