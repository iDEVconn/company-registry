import { afterEach, vi } from "vitest";
import { createAuAdapter } from "../../adapters/au";
import { createChAdapter } from "../../adapters/ch";
import { createGbAdapter } from "../../adapters/gb";
import { createNzAdapter } from "../../adapters/nz";
import { createOcAdapter } from "../../adapters/oc";
import { stubFetch } from "./test-utils";

afterEach(() => vi.unstubAllGlobals());

const GATEWAY = "https://gateway.example.com/company";

describe("proxied adapters can target your own gateway", () => {
  it.each([
    ["gb", () => createGbAdapter({ basePath: `${GATEWAY}/gb` }), { items: [] }, `${GATEWAY}/gb/search/companies?`],
    ["au", () => createAuAdapter({ basePath: `${GATEWAY}/au` }), 'callback({"Message":"","Names":[]})', `${GATEWAY}/au/json/MatchingNames.aspx?`],
    ["nz", () => createNzAdapter({ basePath: `${GATEWAY}/nz` }), { items: [] }, `${GATEWAY}/nz/entities?`],
    ["oc", () => createOcAdapter({ basePath: `${GATEWAY}/oc` }), { results: { companies: [] } }, `${GATEWAY}/oc/companies/search?`],
  ])("%s calls the given base path", async (_id, make, body, expectedPrefix) => {
    const fetchMock = stubFetch(body);

    await make().search("bit", undefined, "US");

    expect(String(fetchMock.mock.calls[0]?.[0]).startsWith(expectedPrefix)).toBe(true);
  });

  it("ch posts to the given base path", async () => {
    const fetchMock = stubFetch([]);

    await createChAdapter({ basePath: `${GATEWAY}/ch` }).search("bit");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${GATEWAY}/ch/api/v1/company/search`);
  });

  it("ignores a trailing slash on the base path", async () => {
    const fetchMock = stubFetch({ items: [] });

    await createGbAdapter({ basePath: `${GATEWAY}/gb/` }).search("bit");

    expect(String(fetchMock.mock.calls[0]?.[0]).startsWith(`${GATEWAY}/gb/search/companies?`)).toBe(true);
  });

  it("keeps the Vite proxy path as the default", async () => {
    const fetchMock = stubFetch({ items: [] });

    await createGbAdapter().search("bit");

    expect(String(fetchMock.mock.calls[0]?.[0]).startsWith("/registry/gb/search/companies?")).toBe(true);
  });
});
