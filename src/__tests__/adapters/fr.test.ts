import { afterEach, vi } from 'vitest';
import { frAdapter } from '../../adapters/fr';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const result = (overrides: Record<string, unknown> = {}) => ({
  siren: '429225055',
  nom_complet: 'BIT',
  nom_raison_sociale: 'BIT',
  date_creation: '2000-01-03',
  etat_administratif: 'A',
  siege: {
    numero_voie: '26',
    type_voie: 'RUE',
    libelle_voie: 'DES RIGOLES',
    code_postal: '75020',
    libelle_commune: 'PARIS',
  },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('frAdapter', () => {
  it('maps an active company', async () => {
    stubFetch({ results: [result()] });

    const [first] = await frAdapter.search('bit');

    expect(first).toMatchObject({
      registryId: '429225055',
      name: 'BIT',
      status: 'active',
      incorporationDate: '2000-01-03',
      address: { street: '26 RUE DES RIGOLES', city: 'PARIS', postalCode: '75020', country: 'FR' },
      country: 'FR',
      source: 'Recherche d’entreprises (SIRENE)',
    });
  });

  it('marks a ceased company as inactive', async () => {
    stubFetch({ results: [result({ etat_administratif: 'C' })] });

    const [first] = await frAdapter.search('bit');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Ceased' });
  });

  it('uses the registered name when the full name is missing', async () => {
    stubFetch({ results: [result({ nom_complet: null })] });

    const [first] = await frAdapter.search('bit');

    expect(first?.name).toBe('BIT');
  });

  it('drops records without a name', async () => {
    stubFetch({ results: [result({ nom_complet: null, nom_raison_sociale: null }), result()] });

    expect(await frAdapter.search('bit')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ results: 'nope' });

    await expect(frAdapter.search('bit')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 500 });
    await expect(frAdapter.search('bit')).rejects.toThrow(/500/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(frAdapter.search('bit')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes names with special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ results: [] });

    await frAdapter.search(NASTY_NAME);

    expect(requestedUrl(fetchMock)).toContain(`q=${encodeURIComponent(NASTY_NAME)}`);
  });
});
