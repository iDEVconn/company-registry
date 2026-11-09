import type { CompanyAdapter } from '../types';
import { auAdapter } from './au';
import { chAdapter } from './ch';
import { czAdapter } from './cz';
import { fiAdapter } from './fi';
import { frAdapter } from './fr';
import { gbAdapter } from './gb';
import { gleifAdapter } from './gleif';
import { ilAdapter } from './il';
import { noAdapter } from './no';
import { nzAdapter } from './nz';
import { ocAdapter } from './oc';

/** Dedicated per-country adapters. The GLEIF fallback is deliberately not part of this list. */
export const ADAPTERS: readonly CompanyAdapter[] = [
  ilAdapter,
  noAdapter,
  fiAdapter,
  frAdapter,
  czAdapter,
  gbAdapter,
  auAdapter,
  nzAdapter,
  chAdapter,
  ocAdapter,
];

/**
 * Picks the adapter that serves a country, or GLEIF as a fallback. Pass `adapters` to use your own list, for
 * example adapters created with a custom `basePath`.
 */
export function resolveAdapter(
  country: string,
  adapters: readonly CompanyAdapter[] = ADAPTERS,
): { adapter: CompanyAdapter; fallback: boolean } {
  const adapter = adapters.find((candidate) => candidate.countries.includes(country));
  return adapter ? { adapter, fallback: false } : { adapter: gleifAdapter, fallback: true };
}
