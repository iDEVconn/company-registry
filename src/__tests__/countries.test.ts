import { COUNTRY_CODES, COUNTRY_OPTIONS, countryName } from '../countries';

describe('countryName', () => {
  it.each([
    ['DE', 'Germany'],
    ['de', 'Germany'],
  ])('names %s', (code, name) => {
    expect(countryName(code)).toBe(name);
  });

  it.each(['CZE', 'Deutschland', '', 'D1'])('returns %j unchanged instead of throwing', (raw) => {
    expect(countryName(raw)).toBe(raw);
  });
});

describe('COUNTRY_OPTIONS', () => {
  it('lists every country code exactly once', () => {
    expect(COUNTRY_OPTIONS.map((option) => option.code).sort()).toEqual([...COUNTRY_CODES].sort());
  });

  it('is sorted by country name, not by code', () => {
    const names = COUNTRY_OPTIONS.map((option) => option.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(names[0]).toBe('Afghanistan');
  });
});
