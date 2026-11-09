import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, mapRows, parseEnvelope, postJson } from './http';

// Registry: ARES, the Czech administrative register of economic subjects.
// Name search: yes, but as a POST with a JSON body (`obchodniJmeno`); it is a read-only search.
// Key: none. CORS: `access-control-allow-origin: *`, called directly.
const SOURCE = 'ARES (Czech business register)';
const ENDPOINT = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat';
const LIMIT = 100;
const ACTIVE = 'AKTIVNI';

const text = z.union([z.string(), z.number()]).nullish();

const envelope = z.object({
  ekonomickeSubjekty: z.array(
    z.object({
      ico: text,
      obchodniJmeno: text,
      datumVzniku: text,
      sidlo: z.object({ kodStatu: text, nazevObce: text, psc: text, textovaAdresa: text }).nullish(),
      seznamRegistraci: z.object({ stavZdrojeRos: text }).nullish(),
    }),
  ),
});

type Subject = z.infer<typeof envelope>['ekonomickeSubjekty'][number];

function toCandidate(subject: Subject): CompanyCandidate | null {
  const registryId = clean(subject.ico);
  const name = clean(subject.obchodniJmeno);
  if (!registryId || !name) return null;

  const state = clean(subject.seznamRegistraci?.stavZdrojeRos);

  return {
    registryId,
    name,
    status: state === undefined ? 'unknown' : state === ACTIVE ? 'active' : 'inactive',
    statusText: state === undefined || state === ACTIVE ? undefined : state,
    incorporationDate: clean(subject.datumVzniku),
    address: {
      street: clean(clean(subject.sidlo?.textovaAdresa)?.split(',')[0]),
      city: clean(subject.sidlo?.nazevObce),
      postalCode: clean(subject.sidlo?.psc),
      country: clean(subject.sidlo?.kodStatu),
    },
    country: 'CZ',
    source: SOURCE,
  };
}

export const czAdapter: CompanyAdapter = {
  id: 'cz',
  source: SOURCE,
  countries: ['CZ'],
  requiredEnv: [],
  async search(query, signal) {
    const body = { obchodniJmeno: query, start: 0, pocet: LIMIT };
    const parsed = parseEnvelope(envelope, await postJson(ENDPOINT, body, SOURCE, signal), SOURCE);
    return mapRows(parsed.ekonomickeSubjekty, toCandidate, SOURCE);
  },
};
