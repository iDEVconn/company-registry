import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate, ProxyAdapterOptions } from '../types';
import { clean, getJsonp, mapRows, parseEnvelope, joinBase } from './http';

// Registry: ABN Lookup (Australian Business Register), `json/MatchingNames.aspx`.
// Name search: yes (`name`). Key: ABN_LOOKUP_GUID, sent as a `guid` query parameter by the dev proxy so it never
// reaches the browser. The service answers JSONP (`callback({...})`); an invalid GUID comes back as `Message`.
// Results carry only state and postcode, not a street address.
// NOTE: shape confirmed from a live error payload and the ABR docs; not smoke-tested with a real GUID.
const SOURCE = 'ABN Lookup (Australia)';
const MAX_RESULTS = 100;

const text = z.string().nullish();

const envelope = z.object({
  Message: text,
  Names: z.array(z.object({ Abn: text, AbnStatus: text, Name: text, Postcode: text, State: text })).nullish(),
});

type Match = NonNullable<z.infer<typeof envelope>['Names']>[number];

function toCandidate(match: Match): CompanyCandidate | null {
  const registryId = clean(match.Abn);
  const name = clean(match.Name);
  if (!registryId || !name) return null;

  const state = clean(match.AbnStatus);

  return {
    registryId,
    name,
    status: state === undefined ? 'unknown' : state === 'Active' ? 'active' : 'inactive',
    statusText: state === undefined || state === 'Active' ? undefined : state,
    address: { region: clean(match.State), postalCode: clean(match.Postcode), country: 'AU' },
    country: 'AU',
    source: SOURCE,
  };
}

/**
 * Creates the adapter. By default it calls the Vite plugin's proxy path (`/registry/au`); pass `basePath`
 * to call your own gateway instead.
 */
export function createAuAdapter(options: ProxyAdapterOptions = {}): CompanyAdapter {
  const base = joinBase(options.basePath ?? '/registry/au');
  return {
  id: 'au',
  source: SOURCE,
  countries: ['AU'],
  via: 'proxy',
  requiredEnv: ['ABN_LOOKUP_GUID'],
  async search(query, signal) {
    const url = `${base}/json/MatchingNames.aspx?name=${encodeURIComponent(query)}&maxResults=${MAX_RESULTS}`;
    const parsed = parseEnvelope(envelope, await getJsonp(url, SOURCE, signal), SOURCE);

    const names = parsed.Names ?? [];
    const message = clean(parsed.Message);
    if (message && names.length === 0) throw new Error(`${SOURCE}: ${message}`);

    const seen = new Set<string>();
    return mapRows(names, toCandidate, SOURCE).filter((c) => {
      const key = `${c.registryId}|${c.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  };
}

export const auAdapter = createAuAdapter();
