import { DynamicModule, Global, Module } from '@nestjs/common';
import { z } from 'zod';
import { loadConfig } from './loader.js';

/** DI token that resolves to the validated config object. */
export const CONFIG = Symbol('ATLAS_CONFIG');

export interface ConfigModuleOptions<S extends z.ZodTypeAny> {
  schema: S;
  /** Defaults to process.env. Overridable for tests. */
  source?: Record<string, unknown>;
}

@Global()
@Module({})
export class ConfigModule {
  static forRoot<S extends z.ZodTypeAny>(
    options: ConfigModuleOptions<S>,
  ): DynamicModule {
    const config = loadConfig(options.schema, options.source);
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: CONFIG,
          useValue: config,
        },
      ],
      exports: [CONFIG],
    };
  }
}
