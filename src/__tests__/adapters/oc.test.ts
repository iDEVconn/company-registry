import { afterEach, vi } from 'vitest';
import { ocAdapter } from '../../adapters/oc';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const company = (overrides: Record<string, unknown> = {}) => ({
  company: {
    name: 'BIT INC',
    company_number: '5012345',
    jurisdiction_code: 'us_de',
    incorporation_date: '2012-04-03',
    inactive: false,
    current_status: 'Good Standing',
    registered_address: {
      street_address: '1209 Orange Street',
      locality: 'Wilmington',
      region: 'DE',
      postal_code: '19801',
      country: 'United States',
    },
    ...overrides,
  },
});

const results = (...companies: unknown[]) => ({ results: { companies } });

afterEach(() => vi.unstubAllGlobals());

describe('ocAdapter', () => {
  it('serves the US, Canada and Poland through the dev proxy and needs the token', () => {
    expect(ocAdapter).toMatchObject({
      via: 'proxy',
      countries: ['US', 'CA', 'PL'],
      requiredEnv: ['OPENCORPORATES_API_TOKEN'],
    });
  });

  it('maps an active company', async () => {
    stubFetch(results(company()));

    const [first] = await ocAdapter.search('bit', undefined, 'US');

    expect(first).toMatchObject({
      registryId: '5012345',
      name: 'BIT INC',
      status: 'active',
      incorporationDate: '2012-04-03',
      address: { street: '1209 Orange Street', city: 'Wilmington', region: 'DE', postalCode: '19801', country: 'US' },
      country: 'US',
      source: 'OpenCorporates',
    });
  });

  it('marks an inactive company with its registry status text', async () => {
    stubFetch(results(company({ inactive: true, current_status: 'Dissolved' })));

    const [first] = await ocAdapter.search('bit', undefined, 'US');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Dissolved' });
  });

  it('keeps the status unknown when the registry does not say', async () => {
    stubFetch(results(company({ inactive: null, current_status: null })));

    const [first] = await ocAdapter.search('bit', undefined, 'US');

    expect(first?.status).toBe('unknown');
  });

  it('falls back to the full address line when there is no structured address', async () => {
    stubFetch(results(company({ registered_address: null, registered_address_in_full: '1 Main St, Toronto ON' })));

    const [first] = await ocAdapter.search('bit', undefined, 'CA');

    expect(first?.address?.street).toBe('1 Main St, Toronto ON');
  });

  it('returns an empty list when there are no companies', async () => {
    stubFetch({ results: { companies: [] } });

    expect(await ocAdapter.search('zzzz', undefined, 'PL')).toEqual([]);
  });

  it('drops records without a name or number', async () => {
    stubFetch(results(company({ name: '' }), company({ company_number: null }), company()));

    expect(await ocAdapter.search('bit', undefined, 'US')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ results: { companies: 'nope' } });

    await expect(ocAdapter.search('bit', undefined, 'US')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 401 });
    await expect(ocAdapter.search('bit', undefined, 'US')).rejects.toThrow(/401/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(ocAdapter.search('bit', undefined, 'US')).rejects.toThrow(/rate limit/i);
  });

  it('filters by the lower-case country code, never sends the token, and url-encodes the name', async () => {
    const fetchMock = stubFetch(results());

    await ocAdapter.search(NASTY_NAME, undefined, 'PL');

    const url = requestedUrl(fetchMock);
    expect(url.startsWith('/registry/oc/companies/search?')).toBe(true);
    expect(url).toContain(`q=${encodeURIComponent(NASTY_NAME)}`);
    expect(url).toContain('country_code=pl');
    expect(url).not.toContain('api_token');
  });
});
