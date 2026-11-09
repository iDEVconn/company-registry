// Node-only: imported by vite.config.ts. Keeps registry API keys on the dev server so they never reach the browser bundle.
import type { Plugin, ProxyOptions } from 'vite';
import { ADAPTERS } from '../adapters/index';
import type { CompanyAdapter, RegistryCapabilities } from '../types';

interface Upstream {
  target: string;
  /** Path on the upstream host that the proxied path is appended to. */
  basePath?: string;
  /** Extra query string appended to every proxied request (for example a key the registry wants in the URL). */
  query?(env: Record<string, string | undefined>): string;
  /** Builds the auth headers from env. Only called when every required variable is set. */
  headers(env: Record<string, string | undefined>): Record<string, string>;
}

const basic = (user: string, password = '') => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** Upstream target and auth per proxied adapter id. A proxied adapter without an entry here is reported unavailable. */
const UPSTREAMS: Record<string, Upstream> = {
  // Companies House: HTTP Basic with the API key as username and an empty password.
  gb: {
    target: 'https://api.company-information.service.gov.uk',
    headers: (env) => ({ Authorization: basic(env.COMPANIES_HOUSE_API_KEY ?? '') }),
  },
  // ABN Lookup: the GUID is a query parameter, added here so it never reaches the browser.
  au: {
    target: 'https://abr.business.gov.au',
    headers: () => ({}),
    query: (env) => `guid=${encodeURIComponent(env.ABN_LOOKUP_GUID ?? '')}`,
  },
  // NZBN: subscription key header.
  nz: {
    target: 'https://api.business.govt.nz',
    basePath: '/gateway/nzbn/v5',
    headers: (env) => ({ 'Ocp-Apim-Subscription-Key': env.NZBN_API_KEY ?? '' }),
  },
  // OpenCorporates: token is a query parameter, API version lives in the path.
  oc: {
    target: 'https://api.opencorporates.com',
    basePath: '/v0.4',
    headers: () => ({}),
    query: (env) => `api_token=${encodeURIComponent(env.OPENCORPORATES_API_TOKEN ?? '')}`,
  },
  // Zefix: HTTP Basic credentials, API lives under /ZefixPublicREST.
  ch: {
    target: 'https://www.zefix.admin.ch',
    basePath: '/ZefixPublicREST',
    headers: (env) => ({ Authorization: basic(env.ZEFIX_USERNAME ?? '', env.ZEFIX_PASSWORD ?? '') }),
  },
};

function withQuery(path: string, query: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

const isSet = (value: string | undefined) => value !== undefined && value.trim() !== '';

export function buildRegistryProxy(
  env: Record<string, string | undefined>,
  adapters: readonly CompanyAdapter[] = ADAPTERS,
): { proxy: Record<string, ProxyOptions>; capabilities: RegistryCapabilities } {
  const proxy: Record<string, ProxyOptions> = {};
  const capabilities: RegistryCapabilities = { adapters: {} };

  for (const adapter of adapters.filter((a) => a.via === 'proxy')) {
    const missingEnv = adapter.requiredEnv.filter((name) => !isSet(env[name]));
    const upstream = UPSTREAMS[adapter.id];
    const available = missingEnv.length === 0 && upstream !== undefined;
    capabilities.adapters[adapter.id] = { available, missingEnv };

    if (available) {
      const prefix = `/registry/${adapter.id}`;
      const query = upstream.query?.(env);
      proxy[prefix] = {
        target: upstream.target,
        changeOrigin: true,
        headers: upstream.headers(env),
        // The rewritten path stays secret-free: Vite logs it when an upstream call fails.
        rewrite: (path) => `${upstream.basePath ?? ''}${path.slice(prefix.length)}` || '/',
        // A secret that must travel in the query string is added on the outgoing request only.
        configure: query
          ? (server) => {
              server.on('proxyReq', (proxyReq) => {
                proxyReq.path = withQuery(proxyReq.path, query);
              });
            }
          : undefined,
      };
    }
  }

  return { proxy, capabilities };
}

export function registryDevPlugin(env: Record<string, string | undefined>): Plugin {
  const { proxy, capabilities } = buildRegistryProxy(env);

  return {
    name: 'company-registry-dev-proxy',
    apply: 'serve',
    config: () => ({ server: { proxy } }),
    configureServer(server) {
      server.middlewares.use('/registry/capabilities', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(capabilities));
      });
    },
  };
}
