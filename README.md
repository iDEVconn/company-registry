# @idevconn/company-registry

Server-side company lookup **by name** in national business registries. One adapter per registry behind a common interface, credentials that never leave your server, and an opt-in NestJS module.

Built for onboarding: a manager has a merchant name but not always a confirmed company ID, so your backend searches the registry of the chosen country and returns candidates for a person to pick from. Registry data is a suggestion for a human to confirm, not KYC, and nothing here ever picks a result for you.

## Features

- Framework-free core: types, adapters, country list. No Nest, no React, no Vite.
- One adapter per registry, all returning the same `CompanyCandidate` shape.
- Credentials stay on the server: keyed registries are called directly from Node with the key you give (options or env). Errors never contain URLs or headers, so a key cannot leak through a message.
- A missing key disables only that country. `capabilities()` tells you which registries are configured and which variables are missing (names only).
- Global fallback: any country without a dedicated registry is served by GLEIF (LEI registry, partial coverage), flagged as a fallback.
- Typed failures: every error is a `CompanyRegistryError` with a stable `code`; 15 s request timeout; an answer that returns rows but maps to none fails loudly instead of looking like "no company found".
- Opt-in subpath `@idevconn/company-registry/nestjs`: dynamic module, injectable service, optional controller with your guards.

## Install

```bash
npm install @idevconn/company-registry

# only for the NestJS subpath:
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

Node 22 or newer. The only runtime dependency is `zod`.

## Quick start (core)

```ts
import { createCompanyRegistry, CompanyRegistryError } from "@idevconn/company-registry";

const registry = createCompanyRegistry(); // reads credentials from process.env

try {
  const { candidates, source, fallback } = await registry.search("IL", "Wix", { signal });
  // candidates: [{ registryId: "516110996", name: "WIX WHAT LTD", status: "active",
  //                address: { street, city, postalCode, country }, country: "IL", source }, ...]
  // fallback is true when no dedicated registry serves the country (GLEIF answered): tell the user.
} catch (error) {
  if (error instanceof CompanyRegistryError) {
    // error.code: "timeout" | "rate-limited" | "unreachable" | "http-error" | "bad-response"
    //           | "upstream-error" | "invalid-request" | "misconfigured"
  }
}

registry.availability("GB"); // { state: "available", adapter, fallback } or
                             // { state: "missing-credentials", adapterId, source, missingEnv: ["COMPANIES_HOUSE_API_KEY"] }
registry.capabilities();     // { adapters: { gb: { available, missingEnv }, au: ..., ... } }
```

`search(country, query, { signal? })` validates its input (`country` is ISO 3166-1 alpha-2, `query` is 1 to 200 characters after trimming) and rejects with `invalid-request` otherwise, without calling any registry.

### Credentials

Pass them explicitly or let them come from the environment. Explicit values win.

```ts
createCompanyRegistry({
  credentials: { companiesHouseApiKey: "...", abnLookupGuid: "...", zefixUsername: "...", zefixPassword: "..." },
  env: process.env, // default
});
```

| Registry | Env variable | `credentials` property |
| --- | --- | --- |
| Companies House (UK) | `COMPANIES_HOUSE_API_KEY` | `companiesHouseApiKey` |
| ABN Lookup (Australia) | `ABN_LOOKUP_GUID` | `abnLookupGuid` |
| NZBN (New Zealand) | `NZBN_API_KEY` | `nzbnApiKey` |
| Zefix (Switzerland) | `ZEFIX_USERNAME`, `ZEFIX_PASSWORD` | `zefixUsername`, `zefixPassword` |
| OpenCorporates (US, Canada, Poland) | `OPENCORPORATES_API_TOKEN` | `openCorporatesApiToken` |

### `CompanyCandidate`

| Field | Meaning |
| --- | --- |
| `registryId` | Company number in that registry (string) |
| `name` | Legal name, English where the registry offers it |
| `localName?` | Name in the local script |
| `status` | `"active"`, `"inactive"` or `"unknown"` |
| `statusText?` | Raw registry status for inactive companies |
| `incorporationDate?` | As the registry reports it |
| `address?` | `street`, `city`, `region`, `postalCode`, `country` (all optional) |
| `country` | ISO alpha-2 country that was searched |
| `source` | Human-readable registry name |

## NestJS

```ts
// app.module.ts
import { Module } from "@nestjs/common";
import { CompanyRegistryModule } from "@idevconn/company-registry/nestjs";

@Module({
  imports: [CompanyRegistryModule.forRoot({ global: true })], // credentials from process.env
})
export class AppModule {}
```

```ts
// anywhere
import { Inject, Injectable } from "@nestjs/common";
import { CompanyRegistryService } from "@idevconn/company-registry/nestjs";

@Injectable()
export class OnboardingService {
  constructor(@Inject(CompanyRegistryService) private readonly registry: CompanyRegistryService) {}

  find(country: string, name: string) {
    return this.registry.search(country, name); // rejects with CompanyRegistryError
  }
}
```

Credentials from Nest's `ConfigService`:

```ts
CompanyRegistryModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    credentials: { companiesHouseApiKey: config.get("COMPANIES_HOUSE_API_KEY") },
  }),
});
```

The module adds **no HTTP route by default**: exposing a lookup is an authorisation decision. To get ready-made routes, opt in and pass your own guards:

```ts
CompanyRegistryModule.forRoot({
  controller: { path: "company-registry", guards: [JwtAuthGuard] }, // or `controller: true` for the defaults
});
```

| Route | Answer |
| --- | --- |
| `GET /company-registry/search?country=IL&q=Wix` | `{ candidates, adapterId, source, fallback }` |
| `GET /company-registry/capabilities` | `{ adapters: { gb: { available, missingEnv }, ... } }` (variable names only: protect it with your guards) |

Failures use `{ statusCode, code, message }`: `invalid-request` 400, `rate-limited` 429, `misconfigured` 503 (the message does not name the variable), `timeout` 504, every other registry failure 502, anything unexpected a generic 500. `toHttpException(error)` is exported if you write your own controller or filter. For a microservice, inject `CompanyRegistryService` into your handler instead of using the controller.

## Registries

| Country | Registry | Key |
| --- | --- | --- |
| Israel | Registrar of Companies (data.gov.il) | no |
| Norway | Brønnøysund Register Centre | no |
| Finland | PRH open data (YTJ) | no |
| France | Recherche d'entreprises (SIRENE) | no |
| Czechia | ARES | no |
| United Kingdom | Companies House | yes |
| Australia | ABN Lookup | yes |
| New Zealand | NZBN | yes |
| Switzerland | Zefix | yes |
| United States, Canada, Poland | OpenCorporates | yes |
| any other country | GLEIF (LEI registry, partial coverage) | no |

Each adapter file starts with a comment recording what was checked for that registry.

### Read before relying on it

- **Not every adapter has been tried with real credentials.** Israel, Norway, Finland, France, Czechia and GLEIF were run against the live services. The UK, Australia, New Zealand, Switzerland and OpenCorporates adapters were written from the official documentation and have not been run with a valid key. A wrong field name fails with a clear `bad-response` error; please try each once and adjust the mapping if needed.
- **OpenCorporates licence.** Its free tier is limited to non-commercial and public-benefit use. Commercial use needs a paid OpenCorporates plan. The US, Canada and Poland have no free national registry with search by name (Polish KRS and the Canadian federal API search by number only), which is why OpenCorporates is used there. Without a token those countries report `missing-credentials`.
- Public registries have no SLA, may rate limit, and their data can lag behind reality. Check each registry's terms for your use.
- Zefix needs at least 3 characters and matches from the start of the name. ABN Lookup results carry only state and postcode.
- A client that disconnects does not cancel an in-flight registry call; the 15 s timeout bounds it. Pass an `AbortSignal` to `search` from your own code if you need cancellation.

## Writing your own adapter

Implement `CompanyAdapter` and use the building blocks the core exports (`getJson`, `postJson`, `getJsonp`, `parseEnvelope`, `mapRows`, `clean`). They give you the timeout, typed errors, schema validation and the "rows came back but none could be read" guard for free. Register it with `createCompanyRegistry({ adapters: [myAdapter] })`; custom adapters are checked first, so they can also replace a built-in registry for a country.

```ts
import { z } from "zod";
import { clean, getJson, mapRows, parseEnvelope, type CompanyAdapter, type CompanyCandidate } from "@idevconn/company-registry";

const SOURCE = "My registry";
const envelope = z.object({ rows: z.array(z.object({ id: z.string().nullish(), name: z.string().nullish() })) });

export const myAdapter: CompanyAdapter = {
  id: "my", source: SOURCE, countries: ["XX"], requiredEnv: [],
  async search(query, signal) {
    const url = `https://registry.example/search?q=${encodeURIComponent(query)}`;
    const parsed = parseEnvelope(envelope, await getJson(url, SOURCE, signal), SOURCE);
    return mapRows(parsed.rows, (row): CompanyCandidate | null => {
      const registryId = clean(row.id), name = clean(row.name);
      return registryId && name ? { registryId, name, status: "unknown", country: "XX", source: SOURCE } : null;
    }, SOURCE);
  },
};
```

## Development

```bash
npm install
npm run typecheck && npm run lint && npm test && npm run build
```

Tests make no live network calls (`fetch` is stubbed with recorded payload shapes); the NestJS tests run a real Nest application over HTTP.

### Releasing

Releases use [Changesets](https://github.com/changesets/changesets), the same flow as `@idevconn/llm-router`: add a changeset with `npx changeset`, merge to `main`, the Release workflow opens a "Version Packages" PR, and merging that publishes to npm with provenance (needs npm trusted publishing or an `NPM_TOKEN` on the repository).

## License

Apache-2.0
