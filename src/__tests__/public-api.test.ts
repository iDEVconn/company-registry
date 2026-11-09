import * as core from "../index";
import * as nest from "../nestjs/index";

describe("public API", () => {
  it("exposes the core entry", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        "COUNTRY_CODES",
        "COUNTRY_OPTIONS",
        "CompanyRegistryError",
        "MAX_QUERY_LENGTH",
        "clean",
        "countryName",
        "createAuAdapter",
        "createChAdapter",
        "createCompanyRegistry",
        "createGbAdapter",
        "createNzAdapter",
        "createOcAdapter",
        "czAdapter",
        "fiAdapter",
        "frAdapter",
        "getJson",
        "getJsonp",
        "gleifAdapter",
        "ilAdapter",
        "isCompanyRegistryError",
        "mapRows",
        "noAdapter",
        "parseEnvelope",
        "postJson",
      ].sort(),
    );
  });

  it("exposes the NestJS entry", () => {
    expect(Object.keys(nest).sort()).toEqual(
      [
        "COMPANY_REGISTRY",
        "CompanyRegistryModule",
        "CompanyRegistryService",
        "createCompanyRegistryController",
        "toHttpException",
      ].sort(),
    );
  });

  it("keeps the core entry free of Nest and any browser framework", async () => {
    const fs = await import("node:fs/promises");
    const sources = await Promise.all(
      ["../index.ts", "../registry.ts", "../errors.ts"].map((file) => fs.readFile(new URL(file, import.meta.url), "utf8")),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from ["'](react|vite|@nestjs\/[a-z-]+|@tanstack\/react-query)/);
    }
  });
});
