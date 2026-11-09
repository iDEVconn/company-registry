// Core entry: framework-free, server-side. No React, no Vite, no Nest. Credentials never leave the process.
export type {
  CompanyAdapter,
  CompanyAddress,
  CompanyCandidate,
  CompanyStatus,
  RegistryCapabilities,
} from "./types";

export { CompanyRegistryError, isCompanyRegistryError } from "./errors";
export type { CompanyRegistryErrorCode } from "./errors";

export { MAX_QUERY_LENGTH, createCompanyRegistry } from "./registry";
export type {
  CompanyRegistry,
  CompanyRegistryOptions,
  CountryAvailability,
  RegistryCredentials,
  RegistrySearchResult,
} from "./registry";

export { COUNTRY_CODES, COUNTRY_OPTIONS, countryName } from "./countries";

export { czAdapter } from "./adapters/cz";
export { fiAdapter } from "./adapters/fi";
export { frAdapter } from "./adapters/fr";
export { gleifAdapter } from "./adapters/gleif";
export { ilAdapter } from "./adapters/il";
export { noAdapter } from "./adapters/no";

export { createAuAdapter } from "./adapters/au";
export type { AuAdapterOptions } from "./adapters/au";
export { createChAdapter } from "./adapters/ch";
export type { ChAdapterOptions } from "./adapters/ch";
export { createGbAdapter } from "./adapters/gb";
export type { GbAdapterOptions } from "./adapters/gb";
export { createNzAdapter } from "./adapters/nz";
export type { NzAdapterOptions } from "./adapters/nz";
export { createOcAdapter } from "./adapters/oc";
export type { OcAdapterOptions } from "./adapters/oc";

// Building blocks for writing your own adapter.
export { clean, getJson, getJsonp, mapRows, parseEnvelope, postJson } from "./adapters/http";
