import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';

// Registry: Israel Registrar of Companies, open dataset on data.gov.il (CKAN datastore).
// Name search: yes (`q` full-text). Key: none. CORS: `access-control-allow-origin: *`, so it is called
// directly from the browser. Limits: no documented limit, treat as best effort. Dataset field names are Hebrew.
const SOURCE = 'Israel Registrar of Companies';
const ENDPOINT = 'https://data.gov.il/api/3/action/datastore_search';
const RESOURCE_ID = 'f004176c-b85f-4542-8901-7b3176f9a054';
const LIMIT = 100;
const ACTIVE = 'פעילה';

const cell = z.union([z.string(), z.number(), z.null()]).optional();

const envelope = z.object({
  success: z.literal(true),
  result: z.object({
    records: z.array(
      z.object({
        'מספר חברה': cell,
        'שם חברה': cell,
        'שם באנגלית': cell,
        'סטטוס חברה': cell,
        'תאריך התאגדות': cell,
        'שם עיר': cell,
        'שם רחוב': cell,
        'מספר בית': cell,
        מיקוד: cell,
      }),
    ),
  }),
});

type Row = z.infer<typeof envelope>['result']['records'][number];

function toCandidate(row: Row): CompanyCandidate | null {
  const localName = clean(row['שם חברה']);
  const name = clean(row['שם באנגלית']) ?? localName;
  const registryId = clean(row['מספר חברה']);
  if (!name || !registryId) return null;

  const statusText = clean(row['סטטוס חברה']);
  const street = [clean(row['שם רחוב']), clean(row['מספר בית'])].filter(Boolean).join(' ');

  return {
    registryId,
    name,
    localName,
    status: statusText === undefined ? 'unknown' : statusText === ACTIVE ? 'active' : 'inactive',
    statusText,
    incorporationDate: clean(row['תאריך התאגדות']),
    address: {
      street: street || undefined,
      city: clean(row['שם עיר']),
      postalCode: clean(row['מיקוד']),
      country: 'IL',
    },
    country: 'IL',
    source: SOURCE,
  };
}

export const ilAdapter: CompanyAdapter = {
  id: 'il',
  source: SOURCE,
  countries: ['IL'],
  requiredEnv: [],
  async search(query, signal) {
    const url = `${ENDPOINT}?resource_id=${RESOURCE_ID}&q=${encodeURIComponent(query)}&limit=${LIMIT}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed.result.records, toCandidate, SOURCE);
  },
};
