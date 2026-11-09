// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import { useCompanySearch } from '../../react/use-company-search';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const israelRecords = {
  success: true,
  result: {
    records: [
      { 'מספר חברה': 516110996, 'שם חברה': 'וויקס וואט בע~מ', 'שם באנגלית': 'WIX WHAT LTD', 'סטטוס חברה': 'פעילה' },
    ],
  },
};

function stubFetch(body: unknown = israelRecords) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('useCompanySearch', () => {
  it('searches the registry of the selected country and exposes the candidates', async () => {
    stubFetch();
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search('Wix'));

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]).toMatchObject({ registryId: '516110996', name: 'WIX WHAT LTD' });
  });

  it('trims the name before searching', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search('  Wix  '));

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('q=Wix&');
  });

  it.each(['', '   '])('sends no request for the blank name %j', (name) => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search(name));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it('surfaces a registry failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search('Wix'));

    await waitFor(() => expect(result.current.error?.message).toMatch(/500/));
    expect(result.current.data).toBeUndefined();
  });

  it('aborts the in-flight request on reset and clears the result', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search('Wix'));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;

    act(() => result.current.reset());

    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeUndefined();
  });

  it('aborts the previous request when a new search starts', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Promise(() => {});
      }),
    );
    const { result } = renderHook(() => useCompanySearch('IL'), { wrapper });

    act(() => result.current.search('Wix'));
    act(() => result.current.search('Bit'));

    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('passes the country to adapters that filter by it', async () => {
    const fetchMock = stubFetch({ data: [] });
    const { result } = renderHook(() => useCompanySearch('ZZ'), { wrapper });

    act(() => result.current.search('Wix'));

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))).toContain(
      'filter[entity.legalAddress.country]=ZZ',
    );
  });

  it('searches with a custom adapter list', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const custom = { id: 'custom', source: 'Custom', countries: ['IL'], via: 'direct' as const, requiredEnv: [], search };
    const { result } = renderHook(() => useCompanySearch('IL', { adapters: [custom] }), { wrapper });

    act(() => result.current.search('Wix'));

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(search).toHaveBeenCalledWith('Wix', expect.any(AbortSignal), 'IL');
  });
});
