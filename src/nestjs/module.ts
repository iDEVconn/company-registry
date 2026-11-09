import { Module, type DynamicModule, type FactoryProvider, type ModuleMetadata } from "@nestjs/common";
import { createCompanyRegistry, type CompanyRegistryOptions } from "../registry";
import { createCompanyRegistryController, type CompanyRegistryControllerOptions } from "./controller";
import { CompanyRegistryService } from "./service";
import { COMPANY_REGISTRY } from "./tokens";

export interface CompanyRegistryModuleOptions extends CompanyRegistryOptions {
  /** Make the service injectable everywhere without importing the module. */
  global?: boolean;
  /** Modules your controller guards need providers from. */
  imports?: ModuleMetadata["imports"];
  /**
   * Opt-in HTTP routes (`search`, `capabilities`). Off by default: the service alone adds no route.
   * Pass `true` for the defaults, or `{ path, guards }`.
   */
  controller?: boolean | CompanyRegistryControllerOptions;
}

export interface CompanyRegistryModuleAsyncOptions extends Pick<CompanyRegistryModuleOptions, "global" | "controller"> {
  imports?: ModuleMetadata["imports"];
  inject?: FactoryProvider["inject"];
  useFactory: (...args: never[]) => CompanyRegistryOptions | Promise<CompanyRegistryOptions>;
}

function controllersFor(option: CompanyRegistryModuleOptions["controller"]): ModuleMetadata["controllers"] {
  if (!option) return [];
  return [createCompanyRegistryController(option === true ? {} : option)];
}

@Module({})
export class CompanyRegistryModule {
  static forRoot(options: CompanyRegistryModuleOptions = {}): DynamicModule {
    const { global, imports, controller, ...registryOptions } = options;
    return {
      module: CompanyRegistryModule,
      global: global ?? false,
      imports: imports ?? [],
      controllers: controllersFor(controller),
      providers: [{ provide: COMPANY_REGISTRY, useFactory: () => createCompanyRegistry(registryOptions) }, CompanyRegistryService],
      exports: [COMPANY_REGISTRY, CompanyRegistryService],
    };
  }

  static forRootAsync(options: CompanyRegistryModuleAsyncOptions): DynamicModule {
    return {
      module: CompanyRegistryModule,
      global: options.global ?? false,
      imports: options.imports ?? [],
      controllers: controllersFor(options.controller),
      providers: [
        {
          provide: COMPANY_REGISTRY,
          inject: options.inject ?? [],
          useFactory: async (...args: unknown[]) =>
            createCompanyRegistry(await (options.useFactory as (...a: unknown[]) => CompanyRegistryOptions | Promise<CompanyRegistryOptions>)(...args)),
        },
        CompanyRegistryService,
      ],
      exports: [COMPANY_REGISTRY, CompanyRegistryService],
    };
  }
}
