import { afterEach, vi } from "vitest";
import { createAuAdapter } from "../adapters/au";
import { createChAdapter } from "../adapters/ch";
import { createGbAdapter } from "../adapters/gb";
import { createNzAdapter } from "../adapters/nz";
import { createOcAdapter } from "../adapters/oc";
import { CompanyRegistryError } from "../errors";
import { KEYED_ADAPTERS, MAX_QUERY_LENGTH, createCompanyRegistry } from "../registry";
import type { CompanyAdapter } from "../types";
import { stubFetch } from "./adapters/test-utils";

afterEach(() => vi.unstubAllGlobals());

const ALL_ENV = {
  COMPANIES_HOUSE_API_KEY: "gb-key",
  ABN_LOOKUP_GUID: "au-guid",
  NZBN_API_KEY: "nz-key",
  ZEFIX_USERNAME: "user",
  ZEFIX_PASSWORD: "pass",
  OPENCORPORATES_API_TOKEN: "oc-token",
};

const israelRecords = {
  success: true,
  result: {
    records: [{ "מספר חברה": 516110996, "שם חברה": "וויקס", "שם באנגלית": "WIX WHAT LTD", "סטטוס חברה": "פעילה" }],
  },
};

describe("createCompanyRegistry availability", () => {
  it("serves keyless countries with no credentials at all", () => {
    const registry = createCompanyRegistry({ env: {} });

    for (const country of ["IL", "NO", "FI", "FR", "CZ"]) {
      expect(registry.availability(country)).toMatchObject({ state: "available", fallback: false });
    }
  });

  it("is case-insensitive about the country", () => {
    expect(createCompanyRegistry({ env: {} }).availability("il")).toMatchObject({ state: "available" });
  });

  it("serves a keyed country once its credentials are in env", () => {
    const registry = createCompanyRegistry({ env: ALL_ENV });

    for (const [country, id] of [["GB", "gb"], ["AU", "au"], ["NZ", "nz"], ["CH", "ch"], ["US", "oc"], ["CA", "oc"], ["PL", "oc"]]) {
      expect(registry.availability(country!)).toMatchObject({ state: "available", adapter: { id } });
    }
  });

  it("names the missing variables instead of falling back to GLEIF for a keyed country", () => {
    const registry = createCompanyRegistry({ env: {} });

    expect(registry.availability("GB")).toEqual({
      state: "missing-credentials",
      adapterId: "gb",
      source: "Companies House (UK)",
      missingEnv: ["COMPANIES_HOUSE_API_KEY"],
    });
    expect(registry.availability("CH")).toMatchObject({ missingEnv: ["ZEFIX_USERNAME", "ZEFIX_PASSWORD"] });
  });

  it("reports only the missing half of a two-part credential", () => {
    const registry = createCompanyRegistry({ env: { ZEFIX_USERNAME: "user" } });

    expect(registry.availability("CH")).toMatchObject({ state: "missing-credentials", missingEnv: ["ZEFIX_PASSWORD"] });
  });

  it("treats a blank value as missing", () => {
    expect(createCompanyRegistry({ env: { COMPANIES_HOUSE_API_KEY: "   " } }).availability("GB")).toMatchObject({
      state: "missing-credentials",
    });
  });

  it("lets explicit credentials win over env", async () => {
    const fetchMock = stubFetch({ items: [] });
    const registry = createCompanyRegistry({
      env: { COMPANIES_HOUSE_API_KEY: "from-env" },
      credentials: { companiesHouseApiKey: "explicit" },
    });

    await registry.search("GB", "bit");

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("explicit:").toString("base64")}`);
  });

  it("falls back to GLEIF for a country with no registry", () => {
    expect(createCompanyRegistry({ env: {} }).availability("DE")).toMatchObject({
      state: "available",
      fallback: true,
      adapter: { id: "gleif" },
    });
  });

  it("prefers a custom adapter for the countries it serves", () => {
    const custom: CompanyAdapter = { id: "custom", source: "Custom", countries: ["IL"], requiredEnv: [], search: async () => [] };

    expect(createCompanyRegistry({ env: {}, adapters: [custom] }).availability("IL")).toMatchObject({
      adapter: { id: "custom" },
    });
  });

  it("reads process.env by default", () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "from-process-env");

    expect(createCompanyRegistry().availability("GB")).toMatchObject({ state: "available" });

    vi.unstubAllEnvs();
  });
});

describe("createCompanyRegistry capabilities", () => {
  it("lists keyed registries with the variable names that are missing, never values", () => {
    const registry = createCompanyRegistry({ env: { COMPANIES_HOUSE_API_KEY: "gb-key", ZEFIX_USERNAME: "u" } });

    const capabilities = registry.capabilities();

    expect(capabilities).toEqual({
      adapters: {
        gb: { available: true, missingEnv: [] },
        au: { available: false, missingEnv: ["ABN_LOOKUP_GUID"] },
        nz: { available: false, missingEnv: ["NZBN_API_KEY"] },
        ch: { available: false, missingEnv: ["ZEFIX_PASSWORD"] },
        oc: { available: false, missingEnv: ["OPENCORPORATES_API_TOKEN"] },
      },
    });
    expect(JSON.stringify(capabilities)).not.toContain("gb-key");
  });
});

describe("createCompanyRegistry search", () => {
  it("returns the candidates with the registry they came from", async () => {
    stubFetch(israelRecords);

    const result = await createCompanyRegistry({ env: {} }).search("IL", "Wix");

    expect(result).toMatchObject({ adapterId: "il", source: "Israel Registrar of Companies", fallback: false });
    expect(result.candidates[0]).toMatchObject({ registryId: "516110996", name: "WIX WHAT LTD" });
  });

  it("marks results that came from the fallback", async () => {
    stubFetch({ data: [] });

    const result = await createCompanyRegistry({ env: {} }).search("DE", "Wix");

    expect(result).toMatchObject({ adapterId: "gleif", fallback: true, candidates: [] });
  });

  it("passes the abort signal and the country to the adapter", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const custom: CompanyAdapter = { id: "custom", source: "Custom", countries: ["IL"], requiredEnv: [], search };
    const controller = new AbortController();

    await createCompanyRegistry({ env: {}, adapters: [custom] }).search("il", "  Wix  ", { signal: controller.signal });

    expect(search).toHaveBeenCalledWith("Wix", controller.signal, "IL");
  });

  it("refuses a keyed country that is not configured, naming the variables", async () => {
    const error = await createCompanyRegistry({ env: {} })
      .search("GB", "bit")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CompanyRegistryError);
    expect(error).toMatchObject({ code: "misconfigured", source: "Companies House (UK)" });
    expect((error as Error).message).toContain("COMPANIES_HOUSE_API_KEY");
  });

  it.each([
    ["a blank name", "IL", "   "],
    ["a name over the length limit", "IL", "x".repeat(MAX_QUERY_LENGTH + 1)],
    ["a country that is not alpha-2", "ISR", "Wix"],
    ["an empty country", "", "Wix"],
  ])("rejects %s as an invalid request without calling any registry", async (_label, country, query) => {
    const fetchMock = stubFetch(israelRecords);

    await expect(createCompanyRegistry({ env: {} }).search(country, query)).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a registry failure through as the typed error", async () => {
    stubFetch({}, { ok: false, status: 503 });

    await expect(createCompanyRegistry({ env: {} }).search("IL", "Wix")).rejects.toMatchObject({
      code: "http-error",
      status: 503,
    });
  });
});

describe("keyed adapter table", () => {
  const built = {
    gb: createGbAdapter({ apiKey: "k" }),
    au: createAuAdapter({ guid: "k" }),
    nz: createNzAdapter({ apiKey: "k" }),
    ch: createChAdapter({ username: "u", password: "p" }),
    oc: createOcAdapter({ apiToken: "k" }),
  };

  it.each(Object.entries(built))("describes the %s adapter exactly as the adapter does", (id, adapter) => {
    const entry = KEYED_ADAPTERS.find((candidate) => candidate.id === id);

    expect(entry).toMatchObject({
      id: adapter.id,
      source: adapter.source,
      countries: adapter.countries,
      requiredEnv: adapter.requiredEnv,
    });
  });
});
