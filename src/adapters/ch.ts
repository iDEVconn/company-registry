import { z } from 'zod';
import { CompanyRegistryError } from '../errors';
import type { CompanyAdapter, CompanyCandidate } from '../types';
import { clean, mapRows, parseEnvelope, postJson } from './http';
import { basicAuth, joinBase, requireCredential } from './auth';

// Registry: Zefix (Swiss commercial registers), ZefixPublicREST `POST /api/v1/company/search`.
// Name search: yes, begins-with with `*` as wildcard, name must be at least 3 characters. Key: HTTP Basic credentials
// (ZEFIX_USERNAME, ZEFIX_PASSWORD, requested from zefix@bj.admin.ch).
// Results carry the legal seat (city) but no street address.
// NOTE: shape taken from the official OpenAPI document (/ZefixPublicREST/v3/api-docs); not smoke-tested with credentials.
const SOURCE = 'Zefix (Switzerland)';
const MIN_LENGTH = 3;
const DEFAULT_BASE_URL = 'https://www.zefix.admin.ch/ZefixPublicREST';

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

export interface ChAdapterOptions {
  /** Zefix public REST user name. */
  username: string;
  /** Zefix public REST password. */
  password: string;
  /** Defaults to the official host. */
  baseUrl?: string;
}

/** Creates the adapter. Throws `misconfigured` when a credential is missing. */
export function createChAdapter(options: ChAdapterOptions): CompanyAdapter {
  const username = requireCredential(SOURCE, 'username', options.username);
  const password = requireCredential(SOURCE, 'password', options.password);
  const base = joinBase(options.baseUrl ?? DEFAULT_BASE_URL);
  const headers = { Authorization: basicAuth(username, password) };
  return {
    id: 'ch',
    source: SOURCE,
    countries: ['CH'],
    requiredEnv: ['ZEFIX_USERNAME', 'ZEFIX_PASSWORD'],
    async search(query, signal) {
      if (query.trim().length < MIN_LENGTH) {
        throw new CompanyRegistryError('invalid-request', SOURCE, `${SOURCE} needs at least ${MIN_LENGTH} characters.`);
      }
      const body = { name: `${query}*`, activeOnly: false };
      const answer = await postJson(`${base}/api/v1/company/search`, body, SOURCE, signal, headers);
      return mapRows(parseEnvelope(envelope, answer, SOURCE), toCandidate, SOURCE);
    },
  };
}
