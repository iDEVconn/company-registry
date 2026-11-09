import { COUNTRY_CODES, countryName } from '../../countries';
import { ilAdapter } from '../../adapters/il';
import { resolveAdapter } from '../../adapters/index';

describe('resolveAdapter', () => {
  it('returns the dedicated adapter for a country that has one', () => {
    const { adapter, fallback } = resolveAdapter('IL');

    expect(adapter.id).toBe('il');
    expect(fallback).toBe(false);
  });

  it.each([
    ['NO', 'no'],
    ['FI', 'fi'],
    ['FR', 'fr'],
    ['CZ', 'cz'],
    ['GB', 'gb'],
    ['AU', 'au'],
    ['NZ', 'nz'],
    ['CH', 'ch'],
    ['US', 'oc'],
    ['CA', 'oc'],
    ['PL', 'oc'],
  ])('maps %s to the %s adapter', (country, id) => {
    expect(resolveAdapter(country)).toMatchObject({ adapter: { id }, fallback: false });
  });

  it('falls back to GLEIF for a country without a dedicated adapter', () => {
    const { adapter, fallback } = resolveAdapter('ZZ');

    expect(adapter.id).toBe('gleif');
    expect(fallback).toBe(true);
  });
});

describe('countries', () => {
  it('names a country in English', () => {
    expect(countryName('IL')).toBe('Israel');
  });

  it('lists unique two-letter uppercase codes', () => {
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });
});

describe('resolveAdapter with a custom list', () => {
  it('uses the given adapters instead of the built-in ones', () => {
    const custom = { ...ilAdapter, id: 'custom-il' };

    expect(resolveAdapter('IL', [custom])).toMatchObject({ adapter: { id: 'custom-il' }, fallback: false });
  });

  it('falls back to GLEIF when the custom list does not serve the country', () => {
    expect(resolveAdapter('NO', [ilAdapter])).toMatchObject({ adapter: { id: 'gleif' }, fallback: true });
  });
});
