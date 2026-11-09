import { afterEach, vi } from 'vitest';
import { ilAdapter } from '../../adapters/il';

const record = (overrides: Record<string, unknown>) => ({
  'מספר חברה': 516110996,
  'שם חברה': 'וויקס וואט  בע~מ',
  'שם באנגלית': 'WIX WHAT  LTD',
  'סטטוס חברה': 'פעילה',
  'תאריך התאגדות': '26/11/2019',
  'שם עיר': 'תל אביב - יפו',
  'שם רחוב': "יוניצ'מן",
  'מספר בית': '5',
  מיקוד: null,
  ...overrides,
});

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ilAdapter', () => {
  it('maps active and liquidated companies', async () => {
    stubFetch({
      success: true,
      result: {
        records: [
          record({}),
          record({
            'מספר חברה': 516346632,
            'שם חברה': 'וויקס רכש  בע~מ',
            'שם באנגלית': 'WIX PROCUREMENT  LTD',
            'סטטוס חברה': 'מחוסלת מרצון',
          }),
        ],
      },
    });

    const result = await ilAdapter.search('Wix');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      registryId: '516110996',
      name: 'WIX WHAT LTD',
      status: 'active',
      incorporationDate: '26/11/2019',
      address: { street: "יוניצ'מן 5", city: 'תל אביב - יפו' },
      country: 'IL',
      source: 'Israel Registrar of Companies',
    });
    expect(result[1]).toMatchObject({ status: 'inactive', statusText: 'מחוסלת מרצון' });
  });

  it('falls back to the Hebrew name when there is no English name', async () => {
    stubFetch({ success: true, result: { records: [record({ 'שם באנגלית': '' })] } });

    const [first] = await ilAdapter.search('וויקס');

    expect(first?.name).toBe('וויקס וואט בע~מ');
  });

  it('drops records without any usable name', async () => {
    stubFetch({
      success: true,
      result: { records: [record({ 'שם באנגלית': '', 'שם חברה': '' }), record({})] },
    });

    expect(await ilAdapter.search('Wix')).toHaveLength(1);
  });

  it('rejects when the registry reports failure', async () => {
    stubFetch({ success: false });

    await expect(ilAdapter.search('Wix')).rejects.toThrow(/unexpected response/);
  });

  it('rejects on a non-OK response', async () => {
    stubFetch({}, { ok: false, status: 500 });

    await expect(ilAdapter.search('Wix')).rejects.toThrow(/500/);
  });

  it('mentions the rate limit on HTTP 429', async () => {
    stubFetch({}, { ok: false, status: 429 });

    await expect(ilAdapter.search('Wix')).rejects.toThrow(/rate limit/i);
  });

  it('url-encodes names with special and non-Latin characters', async () => {
    const fetchMock = stubFetch({ success: true, result: { records: [] } });
    const name = 'Tom & "Jerry" בע~מ';

    await ilAdapter.search(name);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(`q=${encodeURIComponent(name)}`);
  });

  it('stops waiting for the registry when the caller aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );
    const controller = new AbortController();

    const outcome = ilAdapter.search('Wix', controller.signal);
    controller.abort();

    await expect(outcome).rejects.toMatchObject({ name: 'AbortError' });
  });
});
