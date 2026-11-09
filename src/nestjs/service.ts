import { Inject, Injectable } from "@nestjs/common";
import type { CompanyAdapter, RegistryCapabilities } from "../types";
import type { CompanyRegistry, CountryAvailability, RegistrySearchResult } from "../registry";
import { COMPANY_REGISTRY } from "./tokens";

/**
 * Inject this wherever you need a company lookup. Searches reject with `CompanyRegistryError`; call
 * `toHttpException` (or use the opt-in controller) to turn one into an HTTP response.
 */
@Injectable()
export class CompanyRegistryService {
  constructor(@Inject(COMPANY_REGISTRY) private readonly registry: CompanyRegistry) {}

  get adapters(): readonly CompanyAdapter[] {
    return this.registry.adapters;
  }

  search(country: string, query: string, options?: { signal?: AbortSignal }): Promise<RegistrySearchResult> {
    return this.registry.search(country, query, options);
  }

  availability(country: string): CountryAvailability {
    return this.registry.availability(country);
  }

  capabilities(): RegistryCapabilities {
    return this.registry.capabilities();
  }
}
