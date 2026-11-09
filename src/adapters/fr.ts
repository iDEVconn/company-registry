import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, getJson, mapRows, parseEnvelope } from './http';

// Registry: "Recherche d'entreprises" (data.gouv.fr, built on SIRENE).
// Name search: yes (`q`). Key: none. CORS: `access-control-allow-origin: *`, called directly.
// `per_page` is capped at 25 by the API, so only the first page is read.
const SOURCE = 'Recherche d’entreprises (SIRENE)';
const ENDPOINT = 'https://recherche-entreprises.api.gouv.fr/search';
const PER_PAGE = 25;

const text = z.string().nullish();

const envelope = z.object({
  results: z.array(
    z.object({
      siren: text,
      nom_complet: text,
      nom_raison_sociale: text,
      date_creation: text,
      etat_administratif: text,
      siege: z
        .object({
          numero_voie: text,
          type_voie: text,
          libelle_voie: text,
          code_postal: text,
          libelle_commune: text,
        })
        .nullish(),
    }),
  ),
});

type Result = z.infer<typeof envelope>['results'][number];

function toCandidate(result: Result): CompanyCandidate | null {
  const registryId = clean(result.siren);
  const name = clean(result.nom_complet) ?? clean(result.nom_raison_sociale);
  if (!registryId || !name) return null;

  const state = clean(result.etat_administratif);
  const street = [result.siege?.numero_voie, result.siege?.type_voie, result.siege?.libelle_voie]
    .map(clean)
    .filter(Boolean)
    .join(' ');

  return {
    registryId,
    name,
    status: state === 'A' ? 'active' : state === 'C' ? 'inactive' : 'unknown',
    statusText: state === 'C' ? 'Ceased' : undefined,
    incorporationDate: clean(result.date_creation),
    address: {
      street: street || undefined,
      city: clean(result.siege?.libelle_commune),
      postalCode: clean(result.siege?.code_postal),
      country: 'FR',
    },
    country: 'FR',
    source: SOURCE,
  };
}

export const frAdapter: CompanyAdapter = {
  id: 'fr',
  source: SOURCE,
  countries: ['FR'],
  requiredEnv: [],
  async search(query, signal) {
    const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed.results, toCandidate, SOURCE);
  },
};
