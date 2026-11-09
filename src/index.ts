// Core entry: framework-free. No React, no Vite, no network at import time.
export type {
  CompanyAddress,
  CompanyAdapter,
  CompanyCandidate,
  CompanyStatus,
  ProxyAdapterOptions,
  RegistryCapabilities,
} from "./types";

export { COUNTRY_CODES, COUNTRY_OPTIONS, countryName } from "./countries";

export { ADAPTERS, resolveAdapter } from "./adapters/index";
export { auAdapter, createAuAdapter } from "./adapters/au";
export { chAdapter, createChAdapter } from "./adapters/ch";
export { czAdapter } from "./adapters/cz";
export { fiAdapter } from "./adapters/fi";
export { frAdapter } from "./adapters/fr";
export { createGbAdapter, gbAdapter } from "./adapters/gb";
export { gleifAdapter } from "./adapters/gleif";
export { ilAdapter } from "./adapters/il";
export { noAdapter } from "./adapters/no";
export { createNzAdapter, nzAdapter } from "./adapters/nz";
export { createOcAdapter, ocAdapter } from "./adapters/oc";

// Building blocks for writing your own adapter.
export { clean, getJson, getJsonp, mapRows, parseEnvelope, postJson } from "./adapters/http";
