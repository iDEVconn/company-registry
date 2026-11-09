import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';
import { basicAuth, joinBase, requireCredential } from './auth';

// Registry: Companies House (UK), Public Data API `GET /search/companies`.
// Name search: yes (`q`). Key: COMPANIES_HOUSE_API_KEY (HTTP Basic, key as username). Server-side only: the API
// does not allow browser calls. Statuses follow the Companies House `company_status` enumeration.
// NOTE: written from the official swagger and enumerations; not smoke-tested against the live API (no key in CI).
const SOURCE = 'Companies House (UK)';
const ACTIVE = new Set(['active', 'open', 'registered']);
const ITEMS_PER_PAGE = 100;
const DEFAULT_BASE_URL = 'https://api.company-information.service.gov.uk';

const text = z.string().nullish();

const envelope = z.object({
  items: z
    .array(
      z.object({
        company_number: text,
        title: text,
        company_status: text,
        date_of_creation: text,
        address: z
          .object({
            premises: text,
            address_line_1: text,
            locality: text,
            postal_code: text,
          })
          .nullish(),
      }),
    )
    .optional(),
});

type Item = NonNullable<z.infer<typeof envelope>['items']>[number];

/** `converted-closed` becomes `Converted closed`. */
function label(status: string): string {
  const spaced = status.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toCandidate(item: Item): CompanyCandidate | null {
  const registryId = clean(item.company_number);
  const name = clean(item.title);
  if (!registryId || !name) return null;

  const state = clean(item.company_status);
  const street = [clean(item.address?.premises), clean(item.address?.address_line_1)].filter(Boolean).join(' ');

  return {
    registryId,
    name,
    status: state === undefined ? 'unknown' : ACTIVE.has(state) ? 'active' : 'inactive',
    statusText: state === undefined || ACTIVE.has(state) ? undefined : label(state),
    incorporationDate: clean(item.date_of_creation),
    address: {
      street: street || undefined,
      city: clean(item.address?.locality),
      postalCode: clean(item.address?.postal_code),
      country: 'GB',
    },
    country: 'GB',
    source: SOURCE,
  };
}

export interface GbAdapterOptions {
  /** Companies House API key. */
  apiKey: string;
  /** Defaults to the official API host. */
  baseUrl?: string;
}

/** Creates the adapter. Throws `misconfigured` when the key is missing. */
export function createGbAdapter(options: GbAdapterOptions): CompanyAdapter {
  const apiKey = requireCredential(SOURCE, 'apiKey', options.apiKey);
  const base = joinBase(options.baseUrl ?? DEFAULT_BASE_URL);
  const headers = { Authorization: basicAuth(apiKey) };
  return {
    id: 'gb',
    source: SOURCE,
    countries: ['GB'],
    requiredEnv: ['COMPANIES_HOUSE_API_KEY'],
    async search(query, signal) {
      const url = `${base}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${ITEMS_PER_PAGE}`;
      const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal, headers), SOURCE);
      return mapRows(parsed.items ?? [], toCandidate, SOURCE);
    },
  };
}
