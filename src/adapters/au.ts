import { z } from 'zod';
import { CompanyRegistryError } from '../errors';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJsonp, mapRows, parseEnvelope } from './http';
import { joinBase, requireCredential } from './auth';

// Registry: ABN Lookup (Australian Business Register), `json/MatchingNames.aspx`.
// Name search: yes (`name`). Key: ABN_LOOKUP_GUID, sent as a `guid` query parameter. The service answers JSONP
// (`callback({...})`); an invalid GUID comes back as `Message`.
// Results carry only state and postcode, not a street address.
// NOTE: shape confirmed from a live error payload and the ABR docs; not smoke-tested with a real GUID.
const SOURCE = 'ABN Lookup (Australia)';
const MAX_RESULTS = 100;
const DEFAULT_BASE_URL = 'https://abr.business.gov.au';

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

export interface AuAdapterOptions {
  /** ABN Lookup GUID. */
  guid: string;
  /** Defaults to the official host. */
  baseUrl?: string;
}

/** Creates the adapter. Throws `misconfigured` when the GUID is missing. */
export function createAuAdapter(options: AuAdapterOptions): CompanyAdapter {
  const guid = requireCredential(SOURCE, 'guid', options.guid);
  const base = joinBase(options.baseUrl ?? DEFAULT_BASE_URL);
  return {
    id: 'au',
    source: SOURCE,
    countries: ['AU'],
    requiredEnv: ['ABN_LOOKUP_GUID'],
    async search(query, signal) {
      const url =
        `${base}/json/MatchingNames.aspx?name=${encodeURIComponent(query)}` +
        `&maxResults=${MAX_RESULTS}&guid=${encodeURIComponent(guid)}`;
      const parsed = parseEnvelope(envelope, await getJsonp(url, SOURCE, signal), SOURCE);

      const names = parsed.Names ?? [];
      const message = clean(parsed.Message);
      if (message && names.length === 0) {
        throw new CompanyRegistryError('upstream-error', SOURCE, `${SOURCE}: ${message}`);
      }

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
