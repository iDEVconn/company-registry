import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate, CompanyStatus } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';

// Registry: GLEIF Global LEI Index, used as the fallback for countries without a dedicated adapter.
// Name search: yes (`filter[fulltext]`, also matches addresses). Key: none. CORS: `access-control-allow-origin: *`,
// called directly. Coverage is partial: only entities that hold an LEI (mostly larger and financial companies).
const SOURCE = 'GLEIF (LEI registry)';
const ENDPOINT = 'https://api.gleif.org/api/v1/lei-records';
const PAGE_SIZE = 100;

const text = z.string().nullish();

const envelope = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        lei: z.string(),
        entity: z.object({
          legalName: z.object({ name: text }).nullish(),
          legalAddress: z
            .object({
              addressLines: z.array(z.string()).nullish(),
              city: text,
              country: text,
              postalCode: text,
            })
            .nullish(),
          registeredAs: text,
          status: text,
          creationDate: text,
        }),
      }),
    }),
  ),
});

type Row = z.infer<typeof envelope>['data'][number];

function mapStatus(status: string | undefined): CompanyStatus {
  if (status === 'ACTIVE') return 'active';
  if (status === 'INACTIVE') return 'inactive';
  return 'unknown';
}

function toCandidate(row: Row, country: string): CompanyCandidate | null {
  const { lei, entity } = row.attributes;
  const name = clean(entity.legalName?.name);
  if (!name) return null;

  const statusText = clean(entity.status);
  const address = entity.legalAddress;

  return {
    registryId: clean(entity.registeredAs) ?? lei,
    name,
    status: mapStatus(statusText),
    statusText,
    incorporationDate: clean(entity.creationDate)?.slice(0, 10),
    address: {
      street: clean(address?.addressLines?.join(', ')),
      city: clean(address?.city),
      postalCode: clean(address?.postalCode),
      country: clean(address?.country),
    },
    country,
    source: SOURCE,
  };
}

export const gleifAdapter: CompanyAdapter = {
  id: 'gleif',
  source: SOURCE,
  countries: [],
  requiredEnv: [],
  async search(query, signal, country) {
    const params = [`filter[fulltext]=${encodeURIComponent(query)}`, `page[size]=${PAGE_SIZE}`];
    if (country) params.push(`filter[entity.legalAddress.country]=${encodeURIComponent(country)}`);

    const parsed = parseEnvelope(envelope, await getJson(`${ENDPOINT}?${params.join('&')}`, SOURCE, signal), SOURCE);
    return mapRows(
      parsed.data,
      (row) => toCandidate(row, country ?? clean(row.attributes.entity.legalAddress?.country) ?? ''),
      SOURCE,
    );
  },
};
