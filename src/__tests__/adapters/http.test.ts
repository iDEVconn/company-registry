import { afterEach, vi } from 'vitest';
import { z } from 'zod';
import { CompanyRegistryError } from '../../errors';
import { getJson, getJsonp, mapRows, parseEnvelope, postJson } from '../../adapters/http';

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

describe("typed errors", () => {
  const code = (c: string) => expect.objectContaining({ name: "CompanyRegistryError", code: c, source: "Test registry" });

  it("marks a timeout", async () => {
    vi.useFakeTimers();
    hangingFetch();

    const outcome = expect(getJson("/x", "Test registry")).rejects.toEqual(code("timeout"));
    await vi.advanceTimersByTimeAsync(15_000);

    await outcome;
  });

  it("marks an unreachable registry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(getJson("/x", "Test registry")).rejects.toEqual(code("unreachable"));
  });

  it("marks a rate limit with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(getJson("/x", "Test registry")).rejects.toEqual(
      expect.objectContaining({ code: "rate-limited", status: 429 }),
    );
  });

  it("marks any other HTTP failure with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(getJson("/x", "Test registry")).rejects.toEqual(
      expect.objectContaining({ code: "http-error", status: 503 }),
    );
  });

  it("marks an answer that is not what the registry promises", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    );

    await expect(getJson("/x", "Test registry")).rejects.toEqual(code("bad-response"));
    expect(() => parseEnvelope(z.object({ a: z.string() }), {}, "Test registry")).toThrow(
      expect.objectContaining({ code: "bad-response" }),
    );
    expect(() =>
      mapRows([1], () => null, "Test registry"),
    ).toThrow(expect.objectContaining({ code: "bad-response" }));
  });

  it("is an Error with a readable message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const error = await getJson("/x", "Test registry").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CompanyRegistryError);
    expect((error as Error).message).toBe("Test registry request failed: 503");
  });

  it("never puts the request URL, and so a secret in it, into the error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const error = await getJson("https://registry.example/search?api_token=SUPER-SECRET", "Test registry").catch(
      (e: unknown) => e,
    );

    expect(String(error)).not.toContain("SUPER-SECRET");
  });
});

describe("request headers", () => {
  it("sends the headers on GET and POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await getJson("/x", "Test registry", undefined, { Authorization: "Basic abc" });
    await postJson("/y", { a: 1 }, "Test registry", undefined, { "X-Key": "k" });

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ Authorization: "Basic abc" });
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toEqual({
      "Content-Type": "application/json",
      "X-Key": "k",
    });
  });
});
