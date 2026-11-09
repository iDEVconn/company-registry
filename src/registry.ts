import { createAuAdapter } from "./adapters/au";
import { createChAdapter } from "./adapters/ch";
import { czAdapter } from "./adapters/cz";
import { fiAdapter } from "./adapters/fi";
import { frAdapter } from "./adapters/fr";
import { createGbAdapter } from "./adapters/gb";
import { gleifAdapter } from "./adapters/gleif";
import { ilAdapter } from "./adapters/il";
import { noAdapter } from "./adapters/no";
import { createNzAdapter } from "./adapters/nz";
import { createOcAdapter } from "./adapters/oc";
import { CompanyRegistryError } from "./errors";
import type { CompanyAdapter, CompanyCandidate, RegistryCapabilities } from "./types";

/** Longest search text accepted. Registries match on names, so anything longer is a mistake or abuse. */
export const MAX_QUERY_LENGTH = 200;

/** Credentials for the keyed registries. Anything left out is read from `env` instead. */
export interface RegistryCredentials {
  companiesHouseApiKey?: string;
  abnLookupGuid?: string;
  nzbnApiKey?: string;
  zefixUsername?: string;
  zefixPassword?: string;
  openCorporatesApiToken?: string;
}

export interface CompanyRegistryOptions {
  /** Explicit credentials. They win over `env`. */
  credentials?: RegistryCredentials;
  /** Where credentials are read from when not given explicitly. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Extra adapters. They are checked first, so they can also replace a built-in registry for a country. */
  adapters?: readonly CompanyAdapter[];
}

export type CountryAvailability =
  | { state: "available"; adapter: CompanyAdapter; fallback: boolean }
  | { state: "missing-credentials"; adapterId: string; source: string; missingEnv: string[] };

export interface RegistrySearchResult {
  candidates: CompanyCandidate[];
  /** Id of the adapter that answered, for example `"il"` or `"gleif"`. */
  adapterId: string;
  /** Human-readable registry name. */
  source: string;
  /** True when no dedicated registry serves the country and GLEIF (partial coverage) answered. */
  fallback: boolean;
}

export interface CompanyRegistry {
  /** The adapters that are usable now: keyless ones, keyed ones with credentials, and your own. */
  readonly adapters: readonly CompanyAdapter[];
  /** What serves a country: an adapter, or the names of the env variables that are missing for it. */
  availability(country: string): CountryAvailability;
  /** Searches the registry of `country` (ISO alpha-2) by company name. Rejects with `CompanyRegistryError`. */
  search(country: string, query: string, options?: { signal?: AbortSignal }): Promise<RegistrySearchResult>;
  /** Which keyed registries are configured. Variable names only, never values. */
  capabilities(): RegistryCapabilities;
}

interface KeyedAdapterEntry {
  id: string;
  source: string;
  countries: readonly string[];
  /** Env variable names, in the order the adapter needs them. */
  requiredEnv: readonly string[];
  /** Matching `RegistryCredentials` property for each env variable. */
  credentialKeys: readonly (keyof RegistryCredentials)[];
  create(values: readonly string[]): CompanyAdapter;
}

/** The registries that need a secret. Exported so the table can be checked against the adapters. */
export const KEYED_ADAPTERS: readonly KeyedAdapterEntry[] = [
  {
    id: "gb",
    source: "Companies House (UK)",
    countries: ["GB"],
    requiredEnv: ["COMPANIES_HOUSE_API_KEY"],
    credentialKeys: ["companiesHouseApiKey"],
    create: ([apiKey]) => createGbAdapter({ apiKey: apiKey! }),
  },
  {
    id: "au",
    source: "ABN Lookup (Australia)",
    countries: ["AU"],
    requiredEnv: ["ABN_LOOKUP_GUID"],
    credentialKeys: ["abnLookupGuid"],
    create: ([guid]) => createAuAdapter({ guid: guid! }),
  },
  {
    id: "nz",
    source: "NZBN (New Zealand)",
    countries: ["NZ"],
    requiredEnv: ["NZBN_API_KEY"],
    credentialKeys: ["nzbnApiKey"],
    create: ([apiKey]) => createNzAdapter({ apiKey: apiKey! }),
  },
  {
    id: "ch",
    source: "Zefix (Switzerland)",
    countries: ["CH"],
    requiredEnv: ["ZEFIX_USERNAME", "ZEFIX_PASSWORD"],
    credentialKeys: ["zefixUsername", "zefixPassword"],
    create: ([username, password]) => createChAdapter({ username: username!, password: password! }),
  },
  {
    id: "oc",
    source: "OpenCorporates",
    countries: ["US", "CA", "PL"],
    requiredEnv: ["OPENCORPORATES_API_TOKEN"],
    credentialKeys: ["openCorporatesApiToken"],
    create: ([apiToken]) => createOcAdapter({ apiToken: apiToken! }),
  },
];

const KEYLESS_ADAPTERS: readonly CompanyAdapter[] = [ilAdapter, noAdapter, fiAdapter, frAdapter, czAdapter];

const REQUEST_SOURCE = "Company registry";

const nonBlank = (value: string | undefined): string | undefined => (value?.trim() ? value.trim() : undefined);

export function createCompanyRegistry(options: CompanyRegistryOptions = {}): CompanyRegistry {
  const env = options.env ?? process.env;
  const credentials = options.credentials ?? {};

  const configured: CompanyAdapter[] = [];
  const missing: { entry: KeyedAdapterEntry; missingEnv: string[] }[] = [];
  const status = new Map<string, string[]>();

  for (const entry of KEYED_ADAPTERS) {
    const values = entry.requiredEnv.map((name, index) => {
      const key = entry.credentialKeys[index];
      return nonBlank(key ? credentials[key] : undefined) ?? nonBlank(env[name]);
    });
    const missingEnv = entry.requiredEnv.filter((_name, index) => values[index] === undefined);
    status.set(entry.id, missingEnv);
    if (missingEnv.length === 0) configured.push(entry.create(values as string[]));
    else missing.push({ entry, missingEnv });
  }

  const adapters: readonly CompanyAdapter[] = [...(options.adapters ?? []), ...KEYLESS_ADAPTERS, ...configured];

  function availability(country: string): CountryAvailability {
    const code = country.toUpperCase();
    const adapter = adapters.find((candidate) => candidate.countries.includes(code));
    if (adapter) return { state: "available", adapter, fallback: false };

    const unconfigured = missing.find(({ entry }) => entry.countries.includes(code));
    if (unconfigured) {
      return {
        state: "missing-credentials",
        adapterId: unconfigured.entry.id,
        source: unconfigured.entry.source,
        missingEnv: unconfigured.missingEnv,
      };
    }
    return { state: "available", adapter: gleifAdapter, fallback: true };
  }

  return {
    adapters,
    availability,
    capabilities() {
      const result: RegistryCapabilities = { adapters: {} };
      for (const entry of KEYED_ADAPTERS) {
        const missingEnv = status.get(entry.id) ?? [];
        result.adapters[entry.id] = { available: missingEnv.length === 0, missingEnv: [...missingEnv] };
      }
      return result;
    },
    async search(country, query, searchOptions = {}) {
      if (!/^[A-Za-z]{2}$/.test(country)) {
        throw new CompanyRegistryError(
          "invalid-request",
          REQUEST_SOURCE,
          "The country must be an ISO 3166-1 alpha-2 code, for example IL.",
        );
      }
      const text = query.trim();
      if (text === "") {
        throw new CompanyRegistryError("invalid-request", REQUEST_SOURCE, "Enter a company name to search.");
      }
      if (text.length > MAX_QUERY_LENGTH) {
        throw new CompanyRegistryError(
          "invalid-request",
          REQUEST_SOURCE,
          `The company name is too long (at most ${MAX_QUERY_LENGTH} characters).`,
        );
      }

      const found = availability(country);
      if (found.state === "missing-credentials") {
        throw new CompanyRegistryError(
          "misconfigured",
          found.source,
          `${found.source} is not configured: ${found.missingEnv.join(", ")} not set.`,
        );
      }
      const candidates = await found.adapter.search(text, searchOptions.signal, country.toUpperCase());
      return { candidates, adapterId: found.adapter.id, source: found.adapter.source, fallback: found.fallback };
    },
  };
}
