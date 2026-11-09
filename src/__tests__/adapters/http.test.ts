import { afterEach, vi } from 'vitest';
import { z } from 'zod';
import { getJson, getJsonp, mapRows, parseEnvelope } from '../../adapters/http';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A fetch that never answers but honours the abort signal, like the real one. */
function hangingFetch() {
  const fetchMock = vi.fn().mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener('abort', abort);
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request failures', () => {
  it('turns a registry that never answers into a readable timeout error', async () => {
    vi.useFakeTimers();
    hangingFetch();

    const outcome = expect(getJson('/x', 'Test registry')).rejects.toThrow(
      'Test registry did not answer in time. Try again.',
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await outcome;
  });

  it('lets a caller abort pass through unchanged', async () => {
    hangingFetch();
    const controller = new AbortController();

    const outcome = getJson('/x', 'Test registry', controller.signal);
    controller.abort();

    await expect(outcome).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts the request when the caller signal is already aborted', async () => {
    const fetchMock = hangingFetch();
    const controller = new AbortController();
    controller.abort();

    await expect(getJson('/x', 'Test registry', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('explains a network failure without leaking "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(getJson('/x', 'Test registry')).rejects.toThrow(
      'Test registry could not be reached. Check your connection and try again.',
    );
  });

  it('explains a body that is not JSON', async () => {
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

    await expect(getJson('/x', 'Test registry')).rejects.toThrow(/unexpected response/);
  });

  it('explains a JSONP answer that cannot be unwrapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'callback({broken' }));

    await expect(getJsonp('/x', 'Test registry')).rejects.toThrow(/unexpected response/);
  });
});

describe('parseEnvelope', () => {
  const schema = z.object({ items: z.array(z.string()) });

  it('returns parsed data', () => {
    expect(parseEnvelope(schema, { items: ['a'] }, 'Test registry')).toEqual({ items: ['a'] });
  });

  it('throws a readable message instead of the zod dump and logs the issues', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => parseEnvelope(schema, { items: 'nope' }, 'Test registry')).toThrow(
      'Test registry returned an unexpected response. Try again or fill in the details manually.',
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('mapRows', () => {
  const toCandidate = (row: string) =>
    row === '' ? null : { registryId: row, name: row, status: 'active' as const, country: 'XX', source: 's' };

  it('keeps the readable rows', () => {
    expect(mapRows(['a', '', 'b'], toCandidate, 'Test registry').map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('returns an empty list for an empty answer', () => {
    expect(mapRows([], toCandidate, 'Test registry')).toEqual([]);
  });

  it('fails loudly when the registry returned rows and none could be read', () => {
    expect(() => mapRows(['', ''], toCandidate, 'Test registry')).toThrow(
      'Test registry returned 2 results but none could be read; the response mapping may be out of date.',
    );
  });
});
