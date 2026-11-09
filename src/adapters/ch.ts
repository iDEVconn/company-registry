import { z } from 'zod';
import type { CompanyAdapter, CompanyCandidate, ProxyAdapterOptions } from '../types';
import { clean, mapRows, parseEnvelope, postJson, joinBase } from './http';

// Registry: Zefix (Swiss commercial registers), ZefixPublicREST `POST /api/v1/company/search`.
// Name search: yes, begins-with with `*` as wildcard, name must be at least 3 characters. Key: HTTP Basic credentials
// (ZEFIX_USERNAME, ZEFIX_PASSWORD, requested from zefix@bj.admin.ch), injected by the dev proxy.
// Results carry the legal seat (city) but no street address.
// NOTE: shape taken from the official OpenAPI document (/ZefixPublicREST/v3/api-docs); not smoke-tested with credentials.
const SOURCE = 'Zefix (Switzerland)';
const MIN_LENGTH = 3;

const text = z.union([z.string(), z.number()]).nullish();

const envelope = z.array(
  z.object({
    name: text,
    ehraid: text,
    uid: text,
    legalSeat: text,
    status: text,
  }),
);

type Firm = z.infer<typeof envelope>[number];

const INACTIVE: Record<string, string> = { CANCELLED: 'Cancelled', BEING_CANCELLED: 'Being cancelled' };

function toCandidate(firm: Firm): CompanyCandidate | null {
  const registryId = clean(firm.uid) ?? clean(firm.ehraid);
  const name = clean(firm.name);
  if (!registryId || !name) return null;

  const state = clean(firm.status);

  return {
    registryId,
    name,
    status: state === undefined ? 'unknown' : state === 'ACTIVE' ? 'active' : 'inactive',
    statusText: state === undefined || state === 'ACTIVE' ? undefined : (INACTIVE[state] ?? state),
    address: { city: clean(firm.legalSeat), country: 'CH' },
    country: 'CH',
    source: SOURCE,
  };
}

/**
 * Creates the adapter. By default it calls the Vite plugin's proxy path (`/registry/ch`); pass `basePath`
 * to call your own gateway instead.
 */
export function createChAdapter(options: ProxyAdapterOptions = {}): CompanyAdapter {
  const base = joinBase(options.basePath ?? '/registry/ch');
  return {
  id: 'ch',
  source: SOURCE,
  countries: ['CH'],
  via: 'proxy',
  requiredEnv: ['ZEFIX_USERNAME', 'ZEFIX_PASSWORD'],
  async search(query, signal) {
    if (query.trim().length < MIN_LENGTH) {
      throw new Error(`${SOURCE} needs at least ${MIN_LENGTH} characters.`);
    }
    const body = { name: `${query}*`, activeOnly: false };
    const answer = await postJson(`${base}/api/v1/company/search`, body, SOURCE, signal);
    return mapRows(parseEnvelope(envelope, answer, SOURCE), toCandidate, SOURCE);
  },
  };
}

export const chAdapter = createChAdapter();
