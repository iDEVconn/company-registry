import { afterEach, vi } from 'vitest';
import { createGbAdapter } from '../../adapters/gb';
import { CompanyRegistryError } from '../../errors';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const gbAdapter = createGbAdapter({ apiKey: 'test-key' });

const item = (overrides: Record<string, unknown> = {}) => ({
  company_number: '12718529',
  title: 'SAIGA ADVISORS LIMITED',
  company_status: 'active',
  date_of_creation: '2020-07-04',
  address: {
    premises: '1',
    address_line_1: 'Barton Wix Hill',
    locality: 'Leatherhead',
    postal_code: 'KT24 6ED',
    country: 'England',
  },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('gbAdapter', () => {
  it('calls Companies House directly with the key as Basic auth', async () => {
    const fetchMock = stubFetch({ items: [] });

    await gbAdapter.search('bit');

    expect(requestedUrl(fetchMock).startsWith('https://api.company-information.service.gov.uk/search/companies?')).toBe(true);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({
      Authorization: `Basic ${Buffer.from('test-key:').toString('base64')}`,
    });
  });

  it('refuses to be created without a key', () => {
    expect(() => createGbAdapter({ apiKey: '  ' })).toThrow(expect.objectContaining({ code: 'misconfigured' }));
    expect(() => createGbAdapter({ apiKey: '  ' })).toThrow(CompanyRegistryError);
  });

  it('can target another base URL', async () => {
    const fetchMock = stubFetch({ items: [] });

    await createGbAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9000/' }).search('bit');

    expect(requestedUrl(fetchMock).startsWith('http://localhost:9000/search/companies?')).toBe(true);
  });

  it('keeps the key out of its own description', () => {
    expect(JSON.stringify({ ...gbAdapter, search: undefined })).not.toContain('test-key');
  });

  it('maps an active company', async () => {
    stubFetch({ items: [item()] });

    const [first] = await gbAdapter.search('saiga');

    expect(first).toMatchObject({
      registryId: '12718529',
      name: 'SAIGA ADVISORS LIMITED',
      status: 'active',
      incorporationDate: '2020-07-04',
      address: { street: '1 Barton Wix Hill', city: 'Leatherhead', postalCode: 'KT24 6ED', country: 'GB' },
      country: 'GB',
      source: 'Companies House (UK)',
    });
  });

  it.each([
    ['dissolved', 'Dissolved'],
    ['liquidation', 'Liquidation'],
    ['converted-closed', 'Converted closed'],
  ])('marks %s as inactive', async (company_status, statusText) => {
    stubFetch({ items: [item({ company_status })] });

    const [first] = await gbAdapter.search('saiga');

    expect(first).toMatchObject({ status: 'inactive', statusText });
  });

  it('treats open and registered as active', async () => {
    stubFetch({ items: [item({ company_status: 'open' }), item({ company_status: 'registered' })] });

    const result = await gbAdapter.search('saiga');

    expect(result.map((c) => c.status)).toEqual(['active', 'active']);
  });

  it('returns an empty list when there are no items', async () => {
    stubFetch({});

    expect(await gbAdapter.search('zzzz')).toEqual([]);
  });

  it('drops records without a name or number', async () => {
    stubFetch({ items: [item({ title: '' }), item({ company_number: null }), item()] });

    expect(await gbAdapter.search('saiga')).toHaveLength(1);
  });

  it('fails loudly when every row is unreadable, so a wrong field mapping is not mistaken for "no company"', async () => {
    stubFetch({ items: [{ unexpected_name: 'X' }, { unexpected_name: 'Y' }] });

    await expect(gbAdapter.search('saiga')).rejects.toThrow(/returned 2 results but none could be read/);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ items: 'nope' });

    await expect(gbAdapter.search('saiga')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 401 });
    await expect(gbAdapter.search('saiga')).rejects.toThrow(/401/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(gbAdapter.search('saiga')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ items: [] });

    await gbAdapter.search(NASTY_NAME);

    const url = requestedUrl(fetchMock);
    expect(url.startsWith('https://api.company-information.service.gov.uk/search/companies?')).toBe(true);
    expect(url).toContain(`q=${encodeURIComponent(NASTY_NAME)}`);
  });
});
