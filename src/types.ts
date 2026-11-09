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
  /** Environment variables that hold this adapter's credentials. Empty for keyless registries. */
  requiredEnv: readonly string[];
  /** `country` is the ISO alpha-2 code being searched. Per-country adapters ignore it; the global fallback filters by it. */
  search(query: string, signal?: AbortSignal, country?: string): Promise<CompanyCandidate[]>;
}

/** Which keyed registries are usable and which env variables are missing. Names only, never values. */
export interface RegistryCapabilities {
  adapters: Record<string, { available: boolean; missingEnv: string[] }>;
}
