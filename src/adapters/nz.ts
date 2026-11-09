import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate, ProxyAdapterOptions } from '../types';
import { clean, getJson, mapRows, parseEnvelope, joinBase } from './http';

// Registry: NZBN (New Zealand Business Number) API v5, `GET /entities?search-term=`.
// Name search: yes. Key: NZBN_API_KEY, sent as `Ocp-Apim-Subscription-Key` by the dev proxy (the portal states a
// subscription key is enough for search). Search results carry no address.
// NOTE: response fields come from the public API portal and client libraries; not smoke-tested with a real key.
const SOURCE = 'NZBN (New Zealand)';
const PAGE_SIZE = 100;
const REGISTERED = 'Registered';

const text = z.string().nullish();

const envelope = z.object({
  items: z
    .array(
      z.object({
        nzbn: text,
        entityName: text,
        entityStatusDescription: text,
        registrationDate: text,
      }),
    )
    .optional(),
});

type Entity = NonNullable<z.infer<typeof envelope>['items']>[number];

function toCandidate(entity: Entity): CompanyCandidate | null {
  const registryId = clean(entity.nzbn);
  const name = clean(entity.entityName);
  if (!registryId || !name) return null;

  const state = clean(entity.entityStatusDescription);

  return {
    registryId,
    name,
    status: state === undefined ? 'unknown' : state === REGISTERED ? 'active' : 'inactive',
    statusText: state === undefined || state === REGISTERED ? undefined : state,
    incorporationDate: clean(entity.registrationDate)?.slice(0, 10),
    country: 'NZ',
    source: SOURCE,
  };
}

/**
 * Creates the adapter. By default it calls the Vite plugin's proxy path (`/registry/nz`); pass `basePath`
 * to call your own gateway instead.
 */
export function createNzAdapter(options: ProxyAdapterOptions = {}): CompanyAdapter {
  const base = joinBase(options.basePath ?? '/registry/nz');
  return {
  id: 'nz',
  source: SOURCE,
  countries: ['NZ'],
  via: 'proxy',
  requiredEnv: ['NZBN_API_KEY'],
  async search(query, signal) {
    const url = `${base}/entities?search-term=${encodeURIComponent(query)}&page-size=${PAGE_SIZE}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed.items ?? [], toCandidate, SOURCE);
  },
  };
}

export const nzAdapter = createNzAdapter();
