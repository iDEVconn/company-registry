# @idevconn/company-registry

Look up and validate companies in national business registries **by name**. One adapter per registry behind a common interface, a Vite dev proxy that keeps API keys on the server, and optional React hooks.

Built for onboarding flows: a manager has a merchant name but not always a confirmed company ID, so the app searches the registry of the chosen country, shows the candidates, and lets a person pick the right one. Registry data is a suggestion for a human to confirm, not KYC, and nothing here ever picks a result for you.

## Features

- Framework-free core: types, adapters, country list. No React, no Vite, no network at import time.
- One adapter per registry, all returning the same `CompanyCandidate` shape.
- Keys never reach the browser: keyed registries are reached through a proxy (the Vite plugin, or your own gateway) that adds the credentials.
- A missing key disables only that country. `GET /registry/capabilities` tells the UI which registries are usable and which env variables are missing.
- Global fallback: any country without a dedicated adapter is served by GLEIF (LEI registry, partial coverage), clearly flagged as a fallback.
- Readable failures: 15 s request timeout, no raw `Failed to fetch` or schema dumps, and an answer that returns rows but maps to none fails loudly instead of looking like "no company found".
- Opt-in subpaths: `@idevconn/company-registry/vite` and `/react`. React, TanStack Query and Vite are **optional** peer dependencies.

## Install

```bash
npm install @idevconn/company-registry

# only if you use the subpaths:
npm install @tanstack/react-query react   # for /react
npm install -D vite                        # for /vite
```

Node 22 or newer. The only runtime dependency is `zod`.

## Quick start (core)

```ts
import { resolveAdapter, countryName } from "@idevconn/company-registry";

const { adapter, fallback } = resolveAdapter("IL"); // ISO 3166-1 alpha-2

const candidates = await adapter.search("Wix", abortController.signal, "IL");
// [{ registryId: "516110996", name: "WIX WHAT LTD", status: "active",
//    address: { street, city, postalCode, country }, country: "IL",
//    source: "Israel Registrar of Companies" }, ...]

if (fallback) {
  // No dedicated registry: results come from GLEIF and may be incomplete. Tell the user.
}
```

`search(query, signal?, country?)` rejects with a readable `Error` on timeout, rate limit (HTTP 429), network failure or an unexpected answer. An aborted `signal` rejects with the usual `AbortError`.

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

## Registries

| Country | Registry | Key | Env variable (proxy side) | Reached |
| --- | --- | --- | --- | --- |
| Israel | Registrar of Companies (data.gov.il) | no | | directly |
| Norway | Brønnøysund Register Centre | no | | directly |
| Finland | PRH open data (YTJ) | no | | directly |
| France | Recherche d'entreprises (SIRENE) | no | | directly |
| Czechia | ARES | no | | directly |
| United Kingdom | Companies House | yes | `COMPANIES_HOUSE_API_KEY` | via proxy |
| Australia | ABN Lookup | yes | `ABN_LOOKUP_GUID` | via proxy |
| New Zealand | NZBN | yes | `NZBN_API_KEY` | via proxy |
| Switzerland | Zefix | yes | `ZEFIX_USERNAME`, `ZEFIX_PASSWORD` | via proxy |
| United States, Canada, Poland | OpenCorporates | yes | `OPENCORPORATES_API_TOKEN` | via proxy |
| any other country | GLEIF (LEI registry, partial coverage) | no | | directly |

"Directly" means the registry allows browser calls (CORS), so no proxy is needed. Each adapter file starts with a comment recording what was checked for that registry.

### Read before relying on it

- **Not every adapter has been tried with real credentials.** Israel, Norway, Finland, France, Czechia and GLEIF were run against the live services. The UK, Australia, New Zealand, Switzerland and OpenCorporates adapters were written from the official documentation and their proxy wiring was checked against the live hosts, but no search was run with a valid key. A wrong field name fails with a clear message; please try each once and adjust the mapping if needed.
- **OpenCorporates licence.** Its free tier is limited to non-commercial and public-benefit use. Commercial use needs a paid OpenCorporates plan. The US, Canada and Poland have no free national registry with search by name (Polish KRS and the Canadian federal API search by number only), which is why OpenCorporates is used there. Without a token those countries are simply disabled.
- Public registries have no SLA, may rate limit, and their data can lag behind reality. Check each registry's terms for your use.
- Zefix needs at least 3 characters and matches from the start of the name. ABN Lookup results carry only state and postcode.

## Keeping keys off the browser: the Vite plugin

Registries marked "via proxy" need a secret, and most do not allow browser calls. The plugin proxies `/registry/<id>/…` to the registry, adds the credentials on the dev server, and serves `GET /registry/capabilities`.

```ts
// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import { registryDevPlugin } from "@idevconn/company-registry/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ""); // "" prefix: also reads variables WITHOUT VITE_
  return { plugins: [registryDevPlugin(env)] };
});
```

```bash
# .env  (note: no VITE_ prefix, so nothing is bundled into the browser build)
COMPANIES_HOUSE_API_KEY=...
ABN_LOOKUP_GUID=...
NZBN_API_KEY=...
ZEFIX_USERNAME=...
ZEFIX_PASSWORD=...
OPENCORPORATES_API_TOKEN=...
```

- A registry with a missing variable is reported unavailable in `/registry/capabilities` and gets no proxy route. Capabilities list variable **names** only, never values.
- Secrets that must travel in a query string (ABN, OpenCorporates) are added to the outgoing request only, so they do not show up in Vite's error logs.
- The plugin runs in `vite dev` only. **A production build has no proxy**, so keyed registries are unavailable there until you provide a gateway (below). Keyless registries keep working.

### Using your own gateway instead

The proxy is a contract, not magic. Serve the same paths from your backend, add the credentials there, and point the adapters at it:

```ts
import { resolveAdapter, createGbAdapter, createAuAdapter, createNzAdapter, createChAdapter, createOcAdapter,
         ilAdapter, noAdapter, fiAdapter, frAdapter, czAdapter } from "@idevconn/company-registry";

const adapters = [
  ilAdapter, noAdapter, fiAdapter, frAdapter, czAdapter,
  createGbAdapter({ basePath: "https://api.example.com/registry/gb" }),
  createAuAdapter({ basePath: "https://api.example.com/registry/au" }),
  createNzAdapter({ basePath: "https://api.example.com/registry/nz" }),
  createChAdapter({ basePath: "https://api.example.com/registry/ch" }),
  createOcAdapter({ basePath: "https://api.example.com/registry/oc" }),
];

resolveAdapter("GB", adapters).adapter.search("Acme");
```

What each `basePath` must forward to, and what your gateway must add:

| Adapter | Upstream | Gateway adds |
| --- | --- | --- |
| `gb` | `https://api.company-information.service.gov.uk` | `Authorization: Basic base64(KEY:)` |
| `au` | `https://abr.business.gov.au` | query parameter `guid=<GUID>` |
| `nz` | `https://api.business.govt.nz/gateway/nzbn/v5` | header `Ocp-Apim-Subscription-Key` |
| `ch` | `https://www.zefix.admin.ch/ZefixPublicREST` | `Authorization: Basic base64(USER:PASS)` |
| `oc` | `https://api.opencorporates.com/v0.4` | query parameter `api_token=<TOKEN>` |

The adapter paths below `basePath` are the registry's own (`/search/companies`, `/json/MatchingNames.aspx`, `/entities`, `/api/v1/company/search`, `/companies/search`). Capabilities contract, if you want the React hook to know what is configured:

```jsonc
// GET <capabilitiesUrl>
{ "adapters": { "gb": { "available": false, "missingEnv": ["COMPANIES_HOUSE_API_KEY"] } } }
```

## React hooks

For when you build your own UI. They need a TanStack Query `QueryClientProvider` above them.

```tsx
import { useCompanySearch, useRegistryAvailability } from "@idevconn/company-registry/react";

function Validate({ country, name }: { country: string; name: string }) {
  const availability = useRegistryAvailability(country);
  const { search, reset, data, isPending, error } = useCompanySearch(country);

  if (availability.state === "missing-key") {
    return <p>Registry disabled: {availability.missingEnv.join(", ")} not set.</p>;
  }
  return (
    <>
      <button disabled={availability.state !== "available" || !name.trim()} onClick={() => search(name)}>
        Validate
      </button>
      {isPending && <p>Searching…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data?.map((c) => <button key={c.registryId} onClick={() => reset()}>{c.name}</button>)}
    </>
  );
}
```

- `useRegistryAvailability(country, { capabilitiesUrl?, adapters? })` returns `{ state: "loading" | "available" | "missing-key" | "proxy-unavailable" }` plus the adapter, a `fallback` flag, or `missingEnv`. `proxy-unavailable` means the capabilities endpoint is missing or not JSON (for example a production build without a proxy).
- `useCompanySearch(country, { adapters? })` returns `{ search, reset, data, isPending, error }`. A blank name sends no request, a new search aborts the previous one, and `reset()` aborts and clears.
- The package ships hooks only, no components, so the dialog and form stay in your design system.

## Writing your own adapter

Implement `CompanyAdapter` and use the building blocks the core exports (`getJson`, `postJson`, `getJsonp`, `parseEnvelope`, `mapRows`, `clean`). They give you the timeout, readable errors, schema validation and the "rows came back but none could be read" guard for free.

```ts
import { z } from "zod";
import { clean, getJson, mapRows, parseEnvelope, type CompanyAdapter, type CompanyCandidate } from "@idevconn/company-registry";

const SOURCE = "My registry";
const envelope = z.object({ rows: z.array(z.object({ id: z.string().nullish(), name: z.string().nullish() })) });

export const myAdapter: CompanyAdapter = {
  id: "my", source: SOURCE, countries: ["XX"], via: "direct", requiredEnv: [],
  async search(query, signal) {
    const parsed = parseEnvelope(envelope, await getJson(`https://registry.example/search?q=${encodeURIComponent(query)}`, SOURCE, signal), SOURCE);
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

Tests make no live network calls (`fetch` is stubbed with recorded payload shapes).

### Releasing

Releases use [Changesets](https://github.com/changesets/changesets), the same flow as `@idevconn/llm-router`: add a changeset with `npx changeset`, merge to `main`, the Release workflow opens a "Version Packages" PR, and merging that publishes to npm with provenance (needs npm trusted publishing or an `NPM_TOKEN` on the repository).

## License

Apache-2.0
