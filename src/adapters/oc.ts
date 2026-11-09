import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';
import { joinBase, requireCredential } from './auth';

// Registry aggregator: OpenCorporates, `GET /v0.4/companies/search`. Used for the United States, Canada and Poland,
// which have no free national registry with name search (Polish KRS searches by number only, the Canadian federal
// API by corporation or business number, and US registries are per state).
// Key: OPENCORPORATES_API_TOKEN, sent as `api_token`. LICENCE: the free tier is limited to
// non-commercial / public-benefit use; commercial use needs a paid OpenCorporates plan.
// NOTE: response fields come from the public API documentation; not smoke-tested with a real token.
const SOURCE = 'OpenCorporates';
const PER_PAGE = 100;
const DEFAULT_BASE_URL = 'https://api.opencorporates.com/v0.4';

const text = z.string().nullish();

const envelope = z.object({
  results: z.object({
    companies: z.array(
      z.object({
        company: z.object({
          name: text,
          company_number: text,
          jurisdiction_code: text,
          incorporation_date: text,
          current_status: text,
          inactive: z.boolean().nullish(),
          registered_address_in_full: text,
          registered_address: z
            .object({
              street_address: text,
              locality: text,
              region: text,
              postal_code: text,
            })
            .nullish(),
        }),
      }),
    ),
  }),
});

type Company = z.infer<typeof envelope>['results']['companies'][number]['company'];

function toCandidate(company: Company, country: string | undefined): CompanyCandidate | null {
  const registryId = clean(company.company_number);
  const name = clean(company.name);
  if (!registryId || !name) return null;

  const address = company.registered_address;
  const statusText = clean(company.current_status);
  const jurisdiction = clean(company.jurisdiction_code)?.slice(0, 2).toUpperCase();

  return {
    registryId,
    name,
    status: company.inactive === true ? 'inactive' : company.inactive === false ? 'active' : 'unknown',
    statusText: company.inactive === true ? (statusText ?? 'Inactive') : undefined,
    incorporationDate: clean(company.incorporation_date),
    address: {
      street: clean(address?.street_address) ?? clean(company.registered_address_in_full),
      city: clean(address?.locality),
      region: clean(address?.region),
      postalCode: clean(address?.postal_code),
      country: country ?? jurisdiction,
    },
    country: country ?? jurisdiction ?? '',
    source: SOURCE,
  };
}

export interface OcAdapterOptions {
  /** OpenCorporates API token. */
  apiToken: string;
  /** Defaults to the official API. */
  baseUrl?: string;
}

/** Creates the adapter. Throws `misconfigured` when the token is missing. */
export function createOcAdapter(options: OcAdapterOptions): CompanyAdapter {
  const apiToken = requireCredential(SOURCE, 'apiToken', options.apiToken);
  const base = joinBase(options.baseUrl ?? DEFAULT_BASE_URL);
  return {
    id: 'oc',
    source: SOURCE,
    countries: ['US', 'CA', 'PL'],
    requiredEnv: ['OPENCORPORATES_API_TOKEN'],
    async search(query, signal, country) {
      const params = [`q=${encodeURIComponent(query)}`, `per_page=${PER_PAGE}`];
      if (country) params.push(`country_code=${encodeURIComponent(country.toLowerCase())}`);
      params.push(`api_token=${encodeURIComponent(apiToken)}`);

      const url = `${base}/companies/search?${params.join('&')}`;
      const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
      return mapRows(parsed.results.companies, ({ company }) => toCandidate(company, country), SOURCE);
    },
  };
}
