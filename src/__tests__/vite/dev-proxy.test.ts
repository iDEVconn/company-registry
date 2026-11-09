import type { ProxyOptions } from 'vite';
import type { CompanyAdapter } from '../../types';
import { buildRegistryProxy } from '../../vite/dev-proxy';

/** Runs the proxy's `configure` hook against a fake http-proxy server and returns the path it would send upstream. */
function outgoingPath(entry: ProxyOptions | undefined, path: string): string | undefined {
  let onProxyReq: ((request: { path: string }) => void) | undefined;
  entry?.configure?.(
    { on: (event: string, handler: typeof onProxyReq) => event === 'proxyReq' && (onProxyReq = handler) } as never,
    {} as never,
  );
  const request = { path };
  onProxyReq?.(request);
  return onProxyReq ? request.path : undefined;
}

const gb: CompanyAdapter = {
  id: 'gb',
  source: 'Companies House',
  countries: ['GB'],
  via: 'proxy',
  requiredEnv: ['COMPANIES_HOUSE_API_KEY'],
  search: async () => [],
};

const direct: CompanyAdapter = { ...gb, id: 'il', countries: ['IL'], via: 'direct', requiredEnv: [] };

describe('buildRegistryProxy', () => {
  it('marks a proxied adapter unavailable and omits its proxy entry when the key is missing', () => {
    const { proxy, capabilities } = buildRegistryProxy({}, [gb]);

    expect(capabilities.adapters.gb).toEqual({ available: false, missingEnv: ['COMPANIES_HOUSE_API_KEY'] });
    expect(proxy['/registry/gb']).toBeUndefined();
  });

  it('proxies with an Authorization header built from the key when it is set', () => {
    const { proxy, capabilities } = buildRegistryProxy({ COMPANIES_HOUSE_API_KEY: 'secret-key' }, [gb]);

    expect(capabilities.adapters.gb).toEqual({ available: true, missingEnv: [] });
    const entry = proxy['/registry/gb'];
    expect(entry?.target).toBe('https://api.company-information.service.gov.uk');
    expect(entry?.headers).toEqual({ Authorization: `Basic ${Buffer.from('secret-key:').toString('base64')}` });
  });

  it('never leaks the key into the capabilities payload', () => {
    const { capabilities } = buildRegistryProxy({ COMPANIES_HOUSE_API_KEY: 'secret-key' }, [gb]);

    expect(JSON.stringify(capabilities)).not.toContain('secret-key');
  });

  it('lists proxy adapters only', () => {
    const { capabilities } = buildRegistryProxy({}, [gb, direct]);

    expect(Object.keys(capabilities.adapters)).toEqual(['gb']);
  });

  it('treats a blank value as missing', () => {
    const { capabilities } = buildRegistryProxy({ COMPANIES_HOUSE_API_KEY: '  ' }, [gb]);

    expect(capabilities.adapters.gb?.available).toBe(false);
  });

  describe('keyed registries', () => {
    const everything = {
      COMPANIES_HOUSE_API_KEY: 'gb-key',
      ABN_LOOKUP_GUID: 'au-guid',
      NZBN_API_KEY: 'nz-key',
      ZEFIX_USERNAME: 'user',
      ZEFIX_PASSWORD: 'pass',
      OPENCORPORATES_API_TOKEN: 'oc-token',
    };

    it('reports every missing variable per adapter when env is empty', () => {
      const { capabilities, proxy } = buildRegistryProxy({});

      expect(capabilities.adapters).toEqual({
        gb: { available: false, missingEnv: ['COMPANIES_HOUSE_API_KEY'] },
        au: { available: false, missingEnv: ['ABN_LOOKUP_GUID'] },
        nz: { available: false, missingEnv: ['NZBN_API_KEY'] },
        ch: { available: false, missingEnv: ['ZEFIX_USERNAME', 'ZEFIX_PASSWORD'] },
        oc: { available: false, missingEnv: ['OPENCORPORATES_API_TOKEN'] },
      });
      expect(proxy).toEqual({});
    });

    it('reports a partially configured adapter as unavailable', () => {
      const { capabilities } = buildRegistryProxy({ ZEFIX_USERNAME: 'user' });

      expect(capabilities.adapters.ch).toEqual({ available: false, missingEnv: ['ZEFIX_PASSWORD'] });
    });

    it('keeps the ABN GUID out of the rewritten path and adds it only to the outgoing request', () => {
      const { proxy, capabilities } = buildRegistryProxy(everything);

      const entry = proxy['/registry/au'];
      expect(entry?.target).toBe('https://abr.business.gov.au');
      expect(entry?.rewrite?.('/registry/au/json/MatchingNames.aspx?name=wix&maxResults=100')).toBe(
        '/json/MatchingNames.aspx?name=wix&maxResults=100',
      );
      expect(outgoingPath(entry, '/json/MatchingNames.aspx?name=wix&maxResults=100')).toBe(
        '/json/MatchingNames.aspx?name=wix&maxResults=100&guid=au-guid',
      );
      expect(JSON.stringify(capabilities)).not.toContain('au-guid');
    });

    it('sends the NZBN subscription key as a header', () => {
      const { proxy } = buildRegistryProxy(everything);

      expect(proxy['/registry/nz']?.headers).toEqual({ 'Ocp-Apim-Subscription-Key': 'nz-key' });
      expect(proxy['/registry/nz']?.rewrite?.('/registry/nz/entities?search-term=wix')).toBe(
        '/gateway/nzbn/v5/entities?search-term=wix',
      );
    });

    it('sends Zefix basic auth and prepends the Zefix base path', () => {
      const { proxy, capabilities } = buildRegistryProxy(everything);

      expect(proxy['/registry/ch']?.headers).toEqual({
        Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
      });
      expect(proxy['/registry/ch']?.rewrite?.('/registry/ch/api/v1/company/search')).toBe(
        '/ZefixPublicREST/api/v1/company/search',
      );
      expect(JSON.stringify(capabilities)).not.toContain('pass');
    });

    it('keeps the OpenCorporates token out of the rewritten path and adds it to the outgoing request', () => {
      const { proxy, capabilities } = buildRegistryProxy(everything);

      const entry = proxy['/registry/oc'];
      expect(entry?.target).toBe('https://api.opencorporates.com');
      expect(entry?.rewrite?.('/registry/oc/companies/search?q=bit&country_code=us')).toBe(
        '/v0.4/companies/search?q=bit&country_code=us',
      );
      expect(outgoingPath(entry, '/v0.4/companies/search?q=bit&country_code=us')).toBe(
        '/v0.4/companies/search?q=bit&country_code=us&api_token=oc-token',
      );
      expect(JSON.stringify(capabilities)).not.toContain('oc-token');
    });

    it('starts a query string when the outgoing path has none', () => {
      const { proxy } = buildRegistryProxy(everything);

      expect(outgoingPath(proxy['/registry/oc'], '/v0.4/companies/search')).toBe(
        '/v0.4/companies/search?api_token=oc-token',
      );
    });

    it('adds nothing to the outgoing request for registries that authenticate by header', () => {
      const { proxy } = buildRegistryProxy(everything);

      expect(proxy['/registry/gb']?.configure).toBeUndefined();
      expect(proxy['/registry/nz']?.configure).toBeUndefined();
    });
  });
});
