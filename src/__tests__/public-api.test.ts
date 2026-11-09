import * as core from "../index";
import * as react from "../react/index";
import * as vite from "../vite/index";

describe("public API", () => {
  it("exposes the core entry", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        "ADAPTERS",
        "COUNTRY_CODES",
        "COUNTRY_OPTIONS",
        "auAdapter",
        "chAdapter",
        "clean",
        "countryName",
        "createAuAdapter",
        "createChAdapter",
        "createGbAdapter",
        "createNzAdapter",
        "createOcAdapter",
        "czAdapter",
        "fiAdapter",
        "frAdapter",
        "gbAdapter",
        "getJson",
        "getJsonp",
        "gleifAdapter",
        "ilAdapter",
        "mapRows",
        "noAdapter",
        "nzAdapter",
        "ocAdapter",
        "parseEnvelope",
        "postJson",
        "resolveAdapter",
      ].sort(),
    );
  });

  it("exposes the Vite entry", () => {
    expect(Object.keys(vite).sort()).toEqual(["buildRegistryProxy", "registryDevPlugin"]);
  });

  it("exposes the React entry", () => {
    expect(Object.keys(react).sort()).toEqual(["useCompanySearch", "useRegistryAvailability"]);
  });

  it("keeps the core entry free of React and Vite", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../index.ts", import.meta.url), "utf8"),
    );

    expect(source).not.toMatch(/from ["'](react|vite|@tanstack\/react-query)/);
  });
});
