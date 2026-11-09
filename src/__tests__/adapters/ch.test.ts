import { afterEach, vi } from 'vitest';
import { chAdapter } from '../../adapters/ch';
import { NASTY_NAME, stubFetch } from './test-utils';

const firm = (overrides: Record<string, unknown> = {}) => ({
  name: 'Bit Solutions AG',
  ehraid: 123456,
  uid: 'CHE-123.456.789',
  legalSeat: 'Zürich',
  status: 'ACTIVE',
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('chAdapter', () => {
  it('goes through the dev proxy and needs the Zefix credentials', () => {
    expect(chAdapter).toMatchObject({ via: 'proxy', requiredEnv: ['ZEFIX_USERNAME', 'ZEFIX_PASSWORD'] });
  });

  it('maps an active company', async () => {
    stubFetch([firm()]);

    const [first] = await chAdapter.search('bit');

    expect(first).toMatchObject({
      registryId: 'CHE-123.456.789',
      name: 'Bit Solutions AG',
      status: 'active',
      address: { city: 'Zürich', country: 'CH' },
      country: 'CH',
      source: 'Zefix (Switzerland)',
    });
  });

  it('falls back to the EHRA id when there is no UID', async () => {
    stubFetch([firm({ uid: undefined })]);

    const [first] = await chAdapter.search('bit');

    expect(first?.registryId).toBe('123456');
  });

  it.each([
    ['CANCELLED', 'Cancelled'],
    ['BEING_CANCELLED', 'Being cancelled'],
  ])('marks %s as inactive', async (status, statusText) => {
    stubFetch([firm({ status })]);

    const [first] = await chAdapter.search('bit');

    expect(first).toMatchObject({ status: 'inactive', statusText });
  });

  it('drops records without a name', async () => {
    stubFetch([firm({ name: '' }), firm()]);

    expect(await chAdapter.search('bit')).toHaveLength(1);
  });

  it('rejects names shorter than three characters without calling the registry', async () => {
    const fetchMock = stubFetch([]);

    await expect(chAdapter.search('bi')).rejects.toThrow(/at least 3 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ not: 'an array' });

    await expect(chAdapter.search('bit')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 401 });
    await expect(chAdapter.search('bit')).rejects.toThrow(/401/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(chAdapter.search('bit')).rejects.toThrow(/rate limit/i);
  });

  it('posts a begins-with search to the proxy path without mangling special characters', async () => {
    const fetchMock = stubFetch([]);

    await chAdapter.search(NASTY_NAME);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/registry/ch/api/v1/company/search');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({ name: `${NASTY_NAME}*`, activeOnly: false });
  });
});
