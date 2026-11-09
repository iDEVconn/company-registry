import { afterEach, vi } from 'vitest';
import { noAdapter } from '../../adapters/no';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const unit = (overrides: Record<string, unknown> = {}) => ({
  organisasjonsnummer: '959562350',
  navn: 'BIT FOR BIT AS',
  registreringsdatoEnhetsregisteret: '1995-03-12',
  forretningsadresse: {
    adresse: ['Landfalløya 26'],
    postnummer: '3023',
    poststed: 'DRAMMEN',
    landkode: 'NO',
  },
  konkurs: false,
  underAvvikling: false,
  underTvangsavviklingEllerTvangsopplosning: false,
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('noAdapter', () => {
  it('maps an active company', async () => {
    stubFetch({ _embedded: { enheter: [unit()] } });

    const [first] = await noAdapter.search('bit');

    expect(first).toMatchObject({
      registryId: '959562350',
      name: 'BIT FOR BIT AS',
      status: 'active',
      incorporationDate: '1995-03-12',
      address: { street: 'Landfalløya 26', city: 'DRAMMEN', postalCode: '3023', country: 'NO' },
      country: 'NO',
      source: 'Brønnøysund Register Centre',
    });
  });

  it.each([
    [{ konkurs: true }, 'Bankrupt'],
    [{ underAvvikling: true }, 'Under liquidation'],
    [{ underTvangsavviklingEllerTvangsopplosning: true }, 'Under forced liquidation'],
    [{ slettedato: '2020-01-01' }, 'Deleted'],
  ])('marks %j as inactive', async (overrides, statusText) => {
    stubFetch({ _embedded: { enheter: [unit(overrides)] } });

    const [first] = await noAdapter.search('bit');

    expect(first).toMatchObject({ status: 'inactive', statusText });
  });

  it('returns an empty list when the registry has no matches', async () => {
    stubFetch({ _links: {}, page: { totalElements: 0 } });

    expect(await noAdapter.search('zzzz')).toEqual([]);
  });

  it('drops records without a name', async () => {
    stubFetch({ _embedded: { enheter: [unit({ navn: '' }), unit()] } });

    expect(await noAdapter.search('bit')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ _embedded: { enheter: 'nope' } });

    await expect(noAdapter.search('bit')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 503 });
    await expect(noAdapter.search('bit')).rejects.toThrow(/503/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(noAdapter.search('bit')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes names with special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ _links: {} });

    await noAdapter.search(NASTY_NAME);

    expect(requestedUrl(fetchMock)).toContain(`navn=${encodeURIComponent(NASTY_NAME)}`);
  });
});
