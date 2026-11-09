import { afterEach, vi } from 'vitest';
import { czAdapter } from '../../adapters/cz';
import { NASTY_NAME, stubFetch } from './test-utils';

const subject = (overrides: Record<string, unknown> = {}) => ({
  ico: '03321886',
  obchodniJmeno: 'BIT Solutions s.r.o.',
  datumVzniku: '2014-08-21',
  sidlo: {
    kodStatu: 'CZ',
    nazevObce: 'Ořech',
    psc: 25225,
    textovaAdresa: 'Husí Plácek 209, 25225 Ořech',
  },
  seznamRegistraci: { stavZdrojeRos: 'AKTIVNI' },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe('czAdapter', () => {
  it('maps an active company', async () => {
    stubFetch({ ekonomickeSubjekty: [subject()] });

    const [first] = await czAdapter.search('bit');

    expect(first).toMatchObject({
      registryId: '03321886',
      name: 'BIT Solutions s.r.o.',
      status: 'active',
      incorporationDate: '2014-08-21',
      address: { street: 'Husí Plácek 209', city: 'Ořech', postalCode: '25225', country: 'CZ' },
      country: 'CZ',
      source: 'ARES (Czech business register)',
    });
  });

  it('marks a non-active registration as inactive and keeps its raw state', async () => {
    stubFetch({ ekonomickeSubjekty: [subject({ seznamRegistraci: { stavZdrojeRos: 'ZANIKLY' } })] });

    const [first] = await czAdapter.search('bit');

    expect(first).toMatchObject({ status: 'inactive', statusText: 'ZANIKLY' });
  });

  it('drops records without a name', async () => {
    stubFetch({ ekonomickeSubjekty: [subject({ obchodniJmeno: '' }), subject()] });

    expect(await czAdapter.search('bit')).toHaveLength(1);
  });

  it('rejects on a malformed payload', async () => {
    stubFetch({ ekonomickeSubjekty: 'nope' });

    await expect(czAdapter.search('bit')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on HTTP errors and mentions the rate limit on 429', async () => {
    stubFetch({}, { ok: false, status: 500 });
    await expect(czAdapter.search('bit')).rejects.toThrow(/500/);

    stubFetch({}, { ok: false, status: 429 });
    await expect(czAdapter.search('bit')).rejects.toThrow(/rate limit/i);
  });

  it('posts the name as JSON without mangling special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ ekonomickeSubjekty: [] });
    const controller = new AbortController();

    await czAdapter.search(NASTY_NAME, controller.signal);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({ method: 'POST' });
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toMatchObject({ obchodniJmeno: NASTY_NAME });
  });
});
