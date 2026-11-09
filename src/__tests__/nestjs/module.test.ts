import "reflect-metadata";
import { Inject, Injectable, Module, type CanActivate, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, vi } from "vitest";
import { CompanyRegistryError } from "../../errors";
import { CompanyRegistryModule, CompanyRegistryService, toHttpException } from "../../nestjs";
import { stubFetch } from "../adapters/test-utils";

const apps: INestApplication[] = [];

async function createApp(imports: unknown[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: imports as never[] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  apps.push(app);
  return app;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const israel = {
  success: true,
  result: {
    records: [{ "מספר חברה": 516110996, "שם חברה": "וויקס", "שם באנגלית": "WIX WHAT LTD", "סטטוס חברה": "פעילה" }],
  },
};

describe("CompanyRegistryModule.forRoot", () => {
  it("provides the service", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CompanyRegistryModule.forRoot({ env: { COMPANIES_HOUSE_API_KEY: "k" } })],
    }).compile();

    const service = moduleRef.get(CompanyRegistryService);

    expect(service.availability("GB")).toMatchObject({ state: "available" });
    expect(service.availability("AU")).toMatchObject({ state: "missing-credentials", missingEnv: ["ABN_LOOKUP_GUID"] });
    expect(service.capabilities().adapters.gb).toEqual({ available: true, missingEnv: [] });
  });

  it("searches through the service", async () => {
    stubFetch(israel);
    const moduleRef = await Test.createTestingModule({ imports: [CompanyRegistryModule.forRoot({ env: {} })] }).compile();

    const result = await moduleRef.get(CompanyRegistryService).search("IL", "Wix");

    expect(result.candidates[0]).toMatchObject({ name: "WIX WHAT LTD" });
  });

  it("does not expose any HTTP route unless asked to", async () => {
    const app = await createApp([CompanyRegistryModule.forRoot({ env: {} })]);

    await request(app.getHttpServer()).get("/company-registry/search?country=IL&q=Wix").expect(404);
  });

  it("is available to other modules without importing it when global", async () => {
    @Injectable()
    class Consumer {
      constructor(@Inject(CompanyRegistryService) readonly registry: CompanyRegistryService) {}
    }
    @Module({ providers: [Consumer] })
    class OtherModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [CompanyRegistryModule.forRoot({ env: {}, global: true }), OtherModule],
    }).compile();

    expect(moduleRef.get(Consumer).registry).toBeInstanceOf(CompanyRegistryService);
  });
});

describe("CompanyRegistryModule.forRootAsync", () => {
  it("builds the options from injected providers, for example a config service", async () => {
    const CONFIG = "CONFIG";
    @Module({ providers: [{ provide: CONFIG, useValue: { get: (name: string) => (name === "GB_KEY" ? "from-config" : undefined) } }], exports: [CONFIG] })
    class ConfigModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [
        CompanyRegistryModule.forRootAsync({
          imports: [ConfigModule],
          inject: [CONFIG],
          useFactory: (config: { get(name: string): string | undefined }) => ({
            env: {},
            credentials: { companiesHouseApiKey: config.get("GB_KEY") },
          }),
        }),
      ],
    }).compile();

    expect(moduleRef.get(CompanyRegistryService).availability("GB")).toMatchObject({ state: "available" });
  });
});

describe("opt-in controller", () => {
  const withController = (extra: object = {}) =>
    createApp([CompanyRegistryModule.forRoot({ env: {}, controller: true, ...extra })]);

  it("searches and answers JSON", async () => {
    stubFetch(israel);
    const app = await withController();

    const response = await request(app.getHttpServer()).get("/company-registry/search?country=il&q=%20Wix%20").expect(200);

    expect(response.body).toMatchObject({ adapterId: "il", fallback: false, source: "Israel Registrar of Companies" });
    expect(response.body.candidates[0]).toMatchObject({ registryId: "516110996", name: "WIX WHAT LTD" });
  });

  it("serves capabilities with variable names only", async () => {
    const app = await createApp([
      CompanyRegistryModule.forRoot({ env: { COMPANIES_HOUSE_API_KEY: "secret-value" }, controller: true }),
    ]);

    const response = await request(app.getHttpServer()).get("/company-registry/capabilities").expect(200);

    expect(response.body.adapters.gb).toEqual({ available: true, missingEnv: [] });
    expect(response.body.adapters.au).toEqual({ available: false, missingEnv: ["ABN_LOOKUP_GUID"] });
    expect(JSON.stringify(response.body)).not.toContain("secret-value");
  });

  it("uses a custom path", async () => {
    stubFetch(israel);
    const app = await withController({ controller: { path: "api/companies" } });

    await request(app.getHttpServer()).get("/api/companies/search?country=IL&q=Wix").expect(200);
    await request(app.getHttpServer()).get("/company-registry/search?country=IL&q=Wix").expect(404);
  });

  it.each([
    ["a missing name", "/company-registry/search?country=IL"],
    ["a blank name", "/company-registry/search?country=IL&q=%20%20"],
    ["a missing country", "/company-registry/search?q=Wix"],
    ["a country that is not alpha-2", "/company-registry/search?country=ISR&q=Wix"],
  ])("answers 400 for %s", async (_label, url) => {
    const app = await withController();

    const response = await request(app.getHttpServer()).get(url).expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, code: "invalid-request" });
  });

  it("answers 503 for a keyed country that is not configured, without naming the variable", async () => {
    const app = await withController();

    const response = await request(app.getHttpServer()).get("/company-registry/search?country=GB&q=bit").expect(503);

    expect(response.body).toMatchObject({ statusCode: 503, code: "misconfigured" });
    expect(JSON.stringify(response.body)).not.toContain("COMPANIES_HOUSE_API_KEY");
  });

  it.each([
    [{ ok: false, status: 429 }, 429, "rate-limited"],
    [{ ok: false, status: 500 }, 502, "http-error"],
  ])("maps a registry failure %j to HTTP %i", async (init, status, code) => {
    stubFetch({}, init);
    const app = await withController();

    const response = await request(app.getHttpServer()).get("/company-registry/search?country=IL&q=Wix").expect(status);

    expect(response.body).toMatchObject({ statusCode: status, code });
  });

  it("applies the guards you give it", async () => {
    stubFetch(israel);
    @Injectable()
    class Deny implements CanActivate {
      canActivate() {
        return false;
      }
    }
    @Injectable()
    class Allow implements CanActivate {
      canActivate() {
        return true;
      }
    }

    const denied = await withController({ controller: { guards: [Deny] } });
    await request(denied.getHttpServer()).get("/company-registry/search?country=IL&q=Wix").expect(403);
    await request(denied.getHttpServer()).get("/company-registry/capabilities").expect(403);

    const allowed = await withController({ controller: { guards: [Allow] } });
    await request(allowed.getHttpServer()).get("/company-registry/search?country=IL&q=Wix").expect(200);
  });
});

describe("toHttpException", () => {
  it.each([
    ["invalid-request", 400],
    ["rate-limited", 429],
    ["timeout", 504],
    ["misconfigured", 503],
    ["unreachable", 502],
    ["bad-response", 502],
    ["http-error", 502],
    ["upstream-error", 502],
  ] as const)("maps %s to %i", (code, status) => {
    const exception = toHttpException(new CompanyRegistryError(code, "Test registry", "Something readable"));

    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ statusCode: status, code });
  });

  it("turns anything else into a plain 500 that leaks nothing", () => {
    const exception = toHttpException(new Error("secret internal detail"));

    expect(exception.getStatus()).toBe(500);
    expect(JSON.stringify(exception.getResponse())).not.toContain("secret internal detail");
  });
});
