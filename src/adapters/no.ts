import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';

// Registry: Brønnøysund Register Centre, Enhetsregisteret open API.
// Name search: yes (`navn`). Key: none. CORS: `access-control-allow-origin: *`, called directly. Page size up to 100.
const SOURCE = 'Brønnøysund Register Centre';
const ENDPOINT = 'https://data.brreg.no/enhetsregisteret/api/enheter';
const LIMIT = 100;

const text = z.string().nullish();

const address = z.object({
  adresse: z.array(z.string()).nullish(),
  postnummer: text,
  poststed: text,
  landkode: text,
});

const envelope = z.object({
  _embedded: z
    .object({
      enheter: z.array(
        z.object({
          organisasjonsnummer: text,
          navn: text,
          registreringsdatoEnhetsregisteret: text,
          forretningsadresse: address.nullish(),
          postadresse: address.nullish(),
          slettedato: text,
          konkurs: z.boolean().nullish(),
          underAvvikling: z.boolean().nullish(),
          underTvangsavviklingEllerTvangsopplosning: z.boolean().nullish(),
        }),
      ),
    })
    .optional(),
});

type Unit = NonNullable<z.infer<typeof envelope>['_embedded']>['enheter'][number];

function inactiveReason(unit: Unit): string | undefined {
  if (unit.slettedato) return 'Deleted';
  if (unit.konkurs) return 'Bankrupt';
  if (unit.underAvvikling) return 'Under liquidation';
  if (unit.underTvangsavviklingEllerTvangsopplosning) return 'Under forced liquidation';
  return undefined;
}

function toCandidate(unit: Unit): CompanyCandidate | null {
  const registryId = clean(unit.organisasjonsnummer);
  const name = clean(unit.navn);
  if (!registryId || !name) return null;

  const where = unit.forretningsadresse ?? unit.postadresse;
  const statusText = inactiveReason(unit);

  return {
    registryId,
    name,
    status: statusText ? 'inactive' : 'active',
    statusText,
    incorporationDate: clean(unit.registreringsdatoEnhetsregisteret),
    address: {
      street: clean(where?.adresse?.join(', ')),
      city: clean(where?.poststed),
      postalCode: clean(where?.postnummer),
      country: clean(where?.landkode),
    },
    country: 'NO',
    source: SOURCE,
  };
}

export const noAdapter: CompanyAdapter = {
  id: 'no',
  source: SOURCE,
  countries: ['NO'],
  via: 'direct',
  requiredEnv: [],
  async search(query, signal) {
    const url = `${ENDPOINT}?navn=${encodeURIComponent(query)}&size=${LIMIT}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed._embedded?.enheter ?? [], toCandidate, SOURCE);
  },
};
