import { afterEach, vi } from 'vitest';
import { auAdapter } from '../../adapters/au';
import { NASTY_NAME, requestedUrl, stubFetch } from './test-utils';

const name = (overrides: Record<string, unknown> = {}) => ({
  Abn: '51824753556',
  AbnStatus: 'Active',
  IsCurrent: true,
  Name: 'WIX PTY LTD',
  NameType: 'Entity Name',
  Postcode: '2000',
  Score: 100,
  State: 'NSW',
  ...overrides,
});

const jsonp = (payload: unknown) => `callback(${JSON.stringify(payload)})`;

afterEach(() => vi.unstubAllGlobals());

describe('auAdapter', () => {
  it('goes through the dev proxy and needs the ABN Lookup GUID', () => {
    expect(auAdapter).toMatchObject({ via: 'proxy', requiredEnv: ['ABN_LOOKUP_GUID'] });
  });

  it('unwraps the JSONP answer and maps an active entity', async () => {
    stubFetch(jsonp({ Message: '', Names: [name()] }));

    const [first] = await auAdapter.search('wix');

    expect(first).toMatchObject({
      registryId: '51824753556',
      name: 'WIX PTY LTD',
      status: 'active',
      address: { postalCode: '2000', region: 'NSW', country: 'AU' },
      country: 'AU',
      source: 'ABN Lookup (Australia)',
    });
  });

  it('marks a cancelled ABN as inactive', async () => {
    stubFetch(jsonp({ Message: '', Names: [name({ AbnStatus: 'Cancelled' })] }));

    const [first] = await auAdapter.search('wix');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'Cancelled' });
  });

  it('collapses repeated ABN and name pairs', async () => {
    stubFetch(jsonp({ Message: '', Names: [name(), name(), name({ Name: 'WIX TRADING' })] }));

    expect(await auAdapter.search('wix')).toHaveLength(2);
  });

  it('turns a registry message with no names into an error', async () => {
    stubFetch(jsonp({ Message: 'The GUID entered is not recognised as a Registered Party', Names: [] }));

    await expect(auAdapter.search('wix')).rejects.toThrow(/GUID entered is not recognised/);
  });

  it('returns an empty list when there are no names and no message', async () => {
    stubFetch(jsonp({ Message: '', Names: [] }));

    expect(await auAdapter.search('zzzz')).toEqual([]);
  });

  it('rejects an answer that is not JSONP', async () => {
    stubFetch('<html>maintenance</html>');

    await expect(auAdapter.search('wix')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch('', { ok: false, status: 500 });
    await expect(auAdapter.search('wix')).rejects.toThrow(/500/);

    stubFetch('', { ok: false, status: 429 });
    await expect(auAdapter.search('wix')).rejects.toThrow(/rate limit/i);
  });

  it('calls the proxy path and url-encodes special and non-Latin characters', async () => {
    const fetchMock = stubFetch(jsonp({ Message: '', Names: [] }));

    await auAdapter.search(NASTY_NAME);

    const url = requestedUrl(fetchMock);
    expect(url.startsWith('/registry/au/json/MatchingNames.aspx?')).toBe(true);
    expect(url).toContain(`name=${encodeURIComponent(NASTY_NAME)}`);
    expect(url).not.toContain('guid');
  });
});
