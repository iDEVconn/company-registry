import { afterEach, vi } from 'vitest';
import { gleifAdapter } from '../../adapters/gleif';

const record = (overrides: { name?: string | null; status?: string; registeredAs?: string | null } = {}) => ({
  id: '549300S35C91YUWXHZ02',
  attributes: {
    lei: '549300S35C91YUWXHZ02',
    entity: {
      legalName: { name: overrides.name === undefined ? 'Saiga Advisors Limited' : overrides.name },
      legalAddress: {
        addressLines: ['Barton Wix Hill', 'West Horsley'],
        city: 'Leatherhead',
        country: 'GB',
        postalCode: 'KT24 6ED',
      },
      registeredAs: overrides.registeredAs === undefined ? '12718529' : overrides.registeredAs,
      jurisdiction: 'GB',
      status: overrides.status ?? 'ACTIVE',
      creationDate: '2020-07-04T00:00:00Z',
    },
  },
});

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('gleifAdapter', () => {
  it('maps active and inactive entities', async () => {
    stubFetch({ data: [record(), record({ name: 'Old Wix Ltd', status: 'INACTIVE', registeredAs: null })] });

    const result = await gleifAdapter.search('Wix');

    expect(result[0]).toMatchObject({
      registryId: '12718529',
      name: 'Saiga Advisors Limited',
      status: 'active',
      incorporationDate: '2020-07-04',
      address: { street: 'Barton Wix Hill, West Horsley', city: 'Leatherhead', postalCode: 'KT24 6ED', country: 'GB' },
      source: 'GLEIF (LEI registry)',
    });
    expect(result[1]).toMatchObject({
      registryId: '549300S35C91YUWXHZ02',
      status: 'inactive',
      statusText: 'INACTIVE',
    });
  });

  it('drops records without a legal name', async () => {
    stubFetch({ data: [record({ name: null }), record()] });

    expect(await gleifAdapter.search('Wix')).toHaveLength(1);
  });

  it('rejects on a malformed envelope', async () => {
    stubFetch({ unexpected: true });

    await expect(gleifAdapter.search('Wix')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on a non-OK response and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 500 });
    await expect(gleifAdapter.search('Wix')).rejects.toThrow(/500/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(gleifAdapter.search('Wix')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes names with special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ data: [] });
    const name = 'Tom & "Jerry" בע~מ';

    await gleifAdapter.search(name);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(encodeURIComponent(name));
  });

  it('filters by the legal address country when one is given', async () => {
    const fetchMock = stubFetch({ data: [] });

    await gleifAdapter.search('Wix', undefined, 'GB');

    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))).toContain(
      'filter[entity.legalAddress.country]=GB',
    );
  });
});
