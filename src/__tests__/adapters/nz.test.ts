import { afterEach, vi } from 'vitest';
import { createNzAdapter } from '../../adapters/nz';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const nzAdapter = createNzAdapter({ apiKey: 'test-key' });

const entity = (overrides: Record<string, unknown> = {}) => ({
  nzbn: '9429041234567',
  entityName: 'WIX LIMITED',
  entityStatusDescription: 'Registered',
  entityTypeDescription: 'NZ Limited Company',
  registrationDate: '2015-03-02T00:00:00',
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('nzAdapter', () => {
  it('calls NZBN directly with the subscription key header', async () => {
    const fetchMock = stubFetch({ items: [] });

    await nzAdapter.search('wix');

    expect(requestedUrl(fetchMock).startsWith('https://api.business.govt.nz/gateway/nzbn/v5/entities?')).toBe(true);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ 'Ocp-Apim-Subscription-Key': 'test-key' });
  });

  it('refuses to be created without a key', () => {
    expect(() => createNzAdapter({ apiKey: '' })).toThrow(expect.objectContaining({ code: 'misconfigured' }));
  });

  it('maps a registered entity', async () => {
    stubFetch({ items: [entity()] });

    const [first] = await nzAdapter.search('wix');

    expect(first).toMatchObject({
      registryId: '9429041234567',
      name: 'WIX LIMITED',
      status: 'active',
      incorporationDate: '2015-03-02',
      country: 'NZ',
      source: 'NZBN (New Zealand)',
    });
  });

  it('marks any other status as inactive and keeps its text', async () => {
    stubFetch({ items: [entity({ entityStatusDescription: 'Removed' })] });

    const [first] = await nzAdapter.search('wix');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Removed' });
  });

  it('returns an empty list when there are no items', async () => {
    stubFetch({});

    expect(await nzAdapter.search('zzzz')).toEqual([]);
  });

  it('drops records without a name or NZBN', async () => {
    stubFetch({ items: [entity({ entityName: '' }), entity({ nzbn: null }), entity()] });

    expect(await nzAdapter.search('wix')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ items: 'nope' });

    await expect(nzAdapter.search('wix')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 401 });
    await expect(nzAdapter.search('wix')).rejects.toThrow(/401/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(nzAdapter.search('wix')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ items: [] });

    await nzAdapter.search(NASTY_NAME);

    const url = requestedUrl(fetchMock);
    expect(url.startsWith('https://api.business.govt.nz/gateway/nzbn/v5/entities?')).toBe(true);
    expect(url).toContain(`search-term=${encodeURIComponent(NASTY_NAME)}`);
  });
});
