import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';

// Registry: Finnish Patent and Registration Office (PRH), open data YTJ API v3.
// Name search: yes (`name`). Key: none. CORS: `access-control-allow-origin: *`, called directly.
// Names carry a type ("1" = main name) and an `endDate` when no longer in use; the current name has no `endDate`.
const SOURCE = 'Finnish Patent and Registration Office (PRH)';
const ENDPOINT = 'https://avoindata.prh.fi/opendata-ytj-api/v3/companies';
const MAIN_NAME = '1';
const FINNISH = '1';

const text = z.string().nullish();

const envelope = z.object({
  companies: z.array(
    z.object({
      businessId: z.object({ value: text }).nullish(),
      names: z.array(z.object({ name: text, type: text, registrationDate: text, endDate: text })).nullish(),
      companySituations: z.array(z.object({ type: text })).nullish(),
      addresses: z
        .array(
          z.object({
            street: text,
            buildingNumber: text,
            postCode: text,
            postOffices: z.array(z.object({ city: text, languageCode: text })).nullish(),
          }),
        )
        .nullish(),
      registrationDate: text,
      endDate: text,
    }),
  ),
});

type Company = z.infer<typeof envelope>['companies'][number];

function currentName(company: Company): string | undefined {
  const main = (company.names ?? []).filter((n) => n.type === MAIN_NAME);
  const current = main.find((n) => !n.endDate);
  if (current) return clean(current.name);
  const latest = [...main].sort((a, b) => (b.registrationDate ?? '').localeCompare(a.registrationDate ?? ''))[0];
  return clean(latest?.name);
}

function toCandidate(company: Company): CompanyCandidate | null {
  const registryId = clean(company.businessId?.value);
  const name = currentName(company);
  if (!registryId || !name) return null;

  const situations = (company.companySituations ?? []).map((s) => clean(s.type)).filter(Boolean);
  const endDate = clean(company.endDate);
  const statusText = endDate
    ? `Ended ${endDate}`
    : situations.length
      ? `Situation: ${situations.join(', ')}`
      : undefined;

  const where = company.addresses?.[0];
  const city = (where?.postOffices?.find((p) => p.languageCode === FINNISH) ?? where?.postOffices?.[0])?.city;
  const street = [clean(where?.street), clean(where?.buildingNumber)].filter(Boolean).join(' ');

  return {
    registryId,
    name,
    status: statusText ? 'inactive' : 'active',
    statusText,
    incorporationDate: clean(company.registrationDate),
    address: { street: street || undefined, city: clean(city), postalCode: clean(where?.postCode), country: 'FI' },
    country: 'FI',
    source: SOURCE,
  };
}

export const fiAdapter: CompanyAdapter = {
  id: 'fi',
  source: SOURCE,
  countries: ['FI'],
  via: 'direct',
  requiredEnv: [],
  async search(query, signal) {
    const url = `${ENDPOINT}?name=${encodeURIComponent(query)}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed.companies, toCandidate, SOURCE);
  },
};
