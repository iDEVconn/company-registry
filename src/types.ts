export type CompanyStatus = 'active' | 'inactive' | 'unknown';

export interface CompanyAddress {
  street?: string;
  city?: string;
  /** State, province or similar. Helps tell same-name companies apart. */
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface CompanyCandidate {
  registryId: string;
  name: string;
  localName?: string;
  status: CompanyStatus;
  /** Raw status text from the registry, shown next to inactive companies. */
  statusText?: string;
  incorporationDate?: string;
  address?: CompanyAddress;
  /** ISO alpha-2 code of the country that was searched. */
  country: string;
  /** Human-readable registry name. */
  source: string;
}

export interface CompanyAdapter {
  id: string;
  source: string;
  /** ISO alpha-2 codes served by this adapter. Empty for the global fallback. */
  countries: readonly string[];
  /** `direct` calls the registry from the browser, `proxy` goes through the dev proxy. */
  via: 'direct' | 'proxy';
  /** Server-side env variables the adapter needs. Empty for keyless registries. */
  requiredEnv: readonly string[];
  /** `country` is the ISO alpha-2 code chosen in the form. Per-country adapters ignore it; the global fallback filters by it. */
  search(query: string, signal?: AbortSignal, country?: string): Promise<CompanyCandidate[]>;
}

/** Contract of `GET /registry/capabilities`: which proxied registries are usable and which env variables are missing. */
export interface RegistryCapabilities {
  adapters: Record<string, { available: boolean; missingEnv: string[] }>;
}

/** Options shared by the adapters that reach their registry through a proxy (the Vite plugin or your own gateway). */
export interface ProxyAdapterOptions {
  /**
   * URL prefix the adapter calls, without a trailing slash. Defaults to the Vite plugin's path
   * (`/registry/<adapter id>`). Point it at your gateway, for example `https://api.example.com/registry/gb`.
   */
  basePath?: string;
}
