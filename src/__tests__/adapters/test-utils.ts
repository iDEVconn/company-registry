import { vi, type Mock } from 'vitest';

/** Replaces global `fetch` with a stub that answers every call with `body`. */
export function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): Mock {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const requestedUrl = (fetchMock: Mock) => String(fetchMock.mock.calls[0]?.[0]);

export const NASTY_NAME = 'Tom & "Jerry" בע~מ';
