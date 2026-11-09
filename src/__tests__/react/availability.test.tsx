// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import { resolveAdapter } from '../../adapters/index';
import { useRegistryAvailability } from '../../react/availability';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stubCapabilities(capabilities: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => capabilities });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('useRegistryAvailability', () => {
  it('is available immediately for a direct adapter and does not fetch capabilities', () => {
    const fetchMock = stubCapabilities({ adapters: {} });

    const { result } = renderHook(() => useRegistryAvailability('IL'), { wrapper });

    expect(result.current).toMatchObject({ state: 'available', fallback: false, adapter: { id: 'il' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is available as a fallback for a country without a dedicated adapter', () => {
    stubCapabilities({ adapters: {} });

    const { result } = renderHook(() => useRegistryAvailability('ZZ'), { wrapper });

    expect(result.current).toMatchObject({ state: 'available', fallback: true, adapter: { id: 'gleif' } });
  });

  it('is loading while capabilities are fetched for a proxied adapter', () => {
    stubCapabilities({ adapters: {} });

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    expect(result.current).toEqual({ state: 'loading' });
  });

  it('reports a missing key with the variable names', async () => {
    stubCapabilities({ adapters: { gb: { available: false, missingEnv: ['COMPANIES_HOUSE_API_KEY'] } } });

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    await waitFor(() =>
      expect(result.current).toMatchObject({ state: 'missing-key', missingEnv: ['COMPANIES_HOUSE_API_KEY'] }),
    );
  });

  it('is available when the proxy has the key', async () => {
    stubCapabilities({ adapters: { gb: { available: true, missingEnv: [] } } });

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    await waitFor(() => expect(result.current).toMatchObject({ state: 'available', adapter: { id: 'gb' } }));
  });

  it('treats a non-JSON answer (production build, HTML fallback) as proxy-unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    await waitFor(() => expect(result.current).toMatchObject({ state: 'proxy-unavailable', adapter: { id: 'gb' } }));
  });

  it('treats a 404 as proxy-unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('proxy-unavailable'));
  });

  it('treats a proxied adapter that the capabilities do not list as proxy-unavailable', async () => {
    stubCapabilities({ adapters: {} });

    const { result } = renderHook(() => useRegistryAvailability('GB'), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('proxy-unavailable'));
  });

  it('reads capabilities from a custom URL', async () => {
    const fetchMock = stubCapabilities({ adapters: { gb: { available: true, missingEnv: [] } } });

    const { result } = renderHook(
      () => useRegistryAvailability('GB', { capabilitiesUrl: 'https://gateway.example.com/registry/capabilities' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe('available'));
    expect(fetchMock).toHaveBeenCalledWith('https://gateway.example.com/registry/capabilities');
  });

  it('resolves the adapter from a custom list', () => {
    stubCapabilities({ adapters: {} });
    const custom = { ...resolveAdapter('IL').adapter, id: 'custom-il' };

    const { result } = renderHook(() => useRegistryAvailability('IL', { adapters: [custom] }), { wrapper });

    expect(result.current).toMatchObject({ state: 'available', adapter: { id: 'custom-il' } });
  });
});
