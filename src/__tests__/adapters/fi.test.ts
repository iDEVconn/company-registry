import { afterEach, vi } from 'vitest';
import { fiAdapter } from '../../adapters/fi';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const company = (overrides: Record<string, unknown> = {}) => ({
  businessId: { value: '0194099-3' },
  names: [
    { name: 'Tikkurila Oyj', type: '1', registrationDate: '2010-02-17' },
    { name: 'Tikkurila Oy', type: '1', registrationDate: '1985-12-31', endDate: '2010-02-16' },
    { name: 'Tikkurilan Väritehtaat', type: '3', registrationDate: '1990-01-01' },
  ],
  companySituations: [],
  addresses: [
    {
      type: 2,
      street: 'Arkadiankatu',
      buildingNumber: '6',
      postCode: '00100',
      postOffices: [
        { city: 'HELSINGFORS', languageCode: '2' },
        { city: 'HELSINKI', languageCode: '1' },
      ],
    },
  ],
  registrationDate: '1978-06-09',
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('fiAdapter', () => {
  it('maps an active company using its current main name and the Finnish city', async () => {
    stubFetch({ companies: [company()] });

    const [first] = await fiAdapter.search('tikkurila');

    expect(first).toMatchObject({
      registryId: '0194099-3',
      name: 'Tikkurila Oyj',
      status: 'active',
      incorporationDate: '1978-06-09',
      address: { street: 'Arkadiankatu 6', city: 'HELSINKI', postalCode: '00100', country: 'FI' },
      country: 'FI',
      source: 'Finnish Patent and Registration Office (PRH)',
    });
  });

  it('marks a company with an end date as inactive', async () => {
    stubFetch({ companies: [company({ endDate: '2004-01-12' })] });

    const [first] = await fiAdapter.search('tikkurila');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Ended 2004-01-12' });
  });

  it('marks a company with a bankruptcy situation as inactive', async () => {
    stubFetch({ companies: [company({ companySituations: [{ type: 'KONK' }] })] });

    const [first] = await fiAdapter.search('tikkurila');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Situation: KONK' });
  });

  it('falls back to the latest main name when every name has ended', async () => {
    stubFetch({
      companies: [
        company({
          names: [
            { name: 'Older Oy', type: '1', registrationDate: '2000-01-01', endDate: '2010-01-01' },
            { name: 'Newer Oy', type: '1', registrationDate: '2010-01-01', endDate: '2020-01-01' },
          ],
        }),
      ],
    });

    const [first] = await fiAdapter.search('oy');

    expect(first?.name).toBe('Newer Oy');
  });

  it('drops records without a name or business id', async () => {
    stubFetch({ companies: [company({ names: [] }), company({ businessId: {} }), company()] });

    expect(await fiAdapter.search('tikkurila')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ companies: 'nope' });

    await expect(fiAdapter.search('x')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 500 });
    await expect(fiAdapter.search('x')).rejects.toThrow(/500/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(fiAdapter.search('x')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes names with special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ companies: [] });

    await fiAdapter.search(NASTY_NAME);

    expect(requestedUrl(fetchMock)).toContain(`name=${encodeURIComponent(NASTY_NAME)}`);
  });
});
