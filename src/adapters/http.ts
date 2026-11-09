import type { z } from 'zod';
import type { CompanyCandidate } from '../types';

export const REQUEST_TIMEOUT_MS = 15_000;

const unexpected = (source: string) =>
  `${source} returned an unexpected response. Try again or fill in the details manually.`;

/**
 * One request with a timeout. Failures become messages a manager can act on: raw `Failed to fetch`,
 * JSON syntax errors and zod dumps never reach the UI. A caller abort passes through as `AbortError`.
 */
async function request<T>(
  url: string,
  source: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const caller = init.signal ?? undefined;
  const controller = new AbortController();
  let timedOut = false;

  const forwardAbort = () => controller.abort(caller?.reason);
  if (caller?.aborted) forwardAbort();
  else caller?.addEventListener('abort', forwardAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      throw new Error(`${source} rate limit reached. Try again in a minute.`);
    }
    if (!response.ok) {
      throw new Error(`${source} request failed: ${response.status}`);
    }
    return await read(response);
  } catch (error) {
    if (timedOut) throw new Error(`${source} did not answer in time. Try again.`, { cause: error });
    if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
    if (error instanceof SyntaxError) throw new Error(unexpected(source), { cause: error });
    if (error instanceof TypeError) {
      throw new Error(`${source} could not be reached. Check your connection and try again.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', forwardAbort);
  }
}

/** GET a JSON document. */
export function getJson(url: string, source: string, signal?: AbortSignal): Promise<unknown> {
  return request(url, source, { signal }, (response) => response.json() as Promise<unknown>);
}

/** POST a JSON body and read a JSON answer. Only for registries whose read-only search is a POST (for example ARES). */
export function postJson(url: string, body: unknown, source: string, signal?: AbortSignal): Promise<unknown> {
  return request(
    url,
    source,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal },
    (response) => response.json() as Promise<unknown>,
  );
}

/** GET a JSONP-wrapped answer (`callback({...})`, as ABN Lookup returns) and unwrap it. */
export function getJsonp(url: string, source: string, signal?: AbortSignal): Promise<unknown> {
  return request(url, source, { signal }, async (response) => {
    const match = /^[\w$.]+\(([\s\S]*)\);?$/.exec((await response.text()).trim());
    if (!match?.[1]) throw new SyntaxError('not JSONP');
    return JSON.parse(match[1]) as unknown;
  });
}

/** Validates an upstream payload. A shape failure is logged for developers and surfaces as a readable error. */
export function parseEnvelope<T extends z.ZodType>(schema: T, data: unknown, source: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`${source}: unexpected response shape`, result.error.issues);
    throw new Error(unexpected(source));
  }
  return result.data;
}

/**
 * Maps registry rows to candidates, dropping unreadable ones. If the registry returned rows and none could be read,
 * the field mapping is wrong: fail loudly instead of looking like "no company found".
 */
export function mapRows<T>(
  rows: readonly T[],
  toCandidate: (row: T) => CompanyCandidate | null,
  source: string,
): CompanyCandidate[] {
  const mapped = rows.map(toCandidate).filter((candidate): candidate is CompanyCandidate => candidate !== null);
  if (rows.length > 0 && mapped.length === 0) {
    throw new Error(
      `${source} returned ${rows.length} results but none could be read; the response mapping may be out of date.`,
    );
  }
  return mapped;
}

/** Collapse runs of whitespace and trim. Returns undefined for empty input. */
export function clean(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
}

/** Strips trailing slashes so `base + "/path"` never doubles them. */
export function joinBase(base: string): string {
  return base.replace(/\/+$/, '');
}
