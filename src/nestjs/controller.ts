import { Controller, Get, Inject, Query, UseGuards, type CanActivate, type Type } from "@nestjs/common";
import { CompanyRegistryError } from "../errors";
import type { RegistryCapabilities } from "../types";
import type { RegistrySearchResult } from "../registry";
import { toHttpException } from "./http-exception";
import { CompanyRegistryService } from "./service";

export interface CompanyRegistryControllerOptions {
  /** Route prefix. Defaults to `company-registry`. */
  path?: string;
  /** Guards applied to every route. Exposing a lookup is an authorisation decision: pass yours. */
  guards?: readonly Type<CanActivate>[];
}

/**
 * Builds a controller with `GET <path>/search?country=IL&q=Wix` and `GET <path>/capabilities`. It is a factory
 * because Nest binds the route and the guards when the class is decorated.
 */
export function createCompanyRegistryController(options: CompanyRegistryControllerOptions = {}): Type<unknown> {
  const guards = options.guards ?? [];

  @Controller(options.path ?? "company-registry")
  @UseGuards(...guards)
  class CompanyRegistryController {
    constructor(@Inject(CompanyRegistryService) private readonly service: CompanyRegistryService) {}

    @Get("search")
    async search(@Query("country") country?: unknown, @Query("q") q?: unknown): Promise<RegistrySearchResult> {
      // A repeated parameter arrives as an array and an extended parser can produce objects: only strings are valid.
      if (typeof country !== "string" || typeof q !== "string") {
        throw toHttpException(
          new CompanyRegistryError("invalid-request", "Company registry", "Both country and q are required."),
        );
      }
      try {
        return await this.service.search(country, q);
      } catch (error) {
        throw toHttpException(error);
      }
    }

    @Get("capabilities")
    capabilities(): RegistryCapabilities {
      return this.service.capabilities();
    }
  }

  return CompanyRegistryController;
}
