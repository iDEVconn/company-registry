import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { resolveAdapter } from '../adapters/index';
import type { CompanyAdapter, RegistryCapabilities } from '../types';

export type RegistryAvailability =
  | { state: 'loading' }
  | { state: 'available'; adapter: CompanyAdapter; fallback: boolean }
  | { state: 'missing-key'; adapter: CompanyAdapter; missingEnv: string[] }
  | { state: 'proxy-unavailable'; adapter: CompanyAdapter };

const DEFAULT_CAPABILITIES_URL = '/registry/capabilities';

const capabilitiesSchema = z.object({
  adapters: z.record(z.string(), z.object({ available: z.boolean(), missingEnv: z.array(z.string()) })),
});

/** Never throws: a missing endpoint (production build) or a non-JSON answer simply means "no proxy". */
async function fetchCapabilities(url: string): Promise<RegistryCapabilities | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const parsed = capabilitiesSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface RegistryAvailabilityOptions {
  /** Where the capabilities are served. Defaults to the Vite plugin's `/registry/capabilities`. */
  capabilitiesUrl?: string;
  /** Adapters to choose from, for example ones created with a custom `basePath`. Defaults to the built-in list. */
  adapters?: readonly CompanyAdapter[];
}

export function useRegistryAvailability(
  country: string,
  options: RegistryAvailabilityOptions = {},
): RegistryAvailability {
  const { capabilitiesUrl = DEFAULT_CAPABILITIES_URL, adapters } = options;
  const { adapter, fallback } = resolveAdapter(country, adapters);
  const needsProxy = adapter.via === 'proxy';
  const capabilities = useQuery({
    queryKey: ['company-registry', 'capabilities', capabilitiesUrl],
    queryFn: () => fetchCapabilities(capabilitiesUrl),
    staleTime: Infinity,
    enabled: needsProxy,
  });

  if (!needsProxy) return { state: 'available', adapter, fallback };
  if (capabilities.isPending) return { state: 'loading' };

  const entry = capabilities.data?.adapters[adapter.id];
  if (!entry) return { state: 'proxy-unavailable', adapter };
  if (!entry.available) return { state: 'missing-key', adapter, missingEnv: entry.missingEnv };
  return { state: 'available', adapter, fallback };
}
