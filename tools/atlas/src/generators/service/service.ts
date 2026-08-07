import {
  formatFiles,
  generateFiles,
  installPackagesTask,
  readProjectConfiguration,
  type Tree,
  updateJson,
  updateProjectConfiguration,
} from '@nx/devkit';
import { applicationGenerator as nestAppGenerator } from '@nx/nest';
import * as path from 'path';
import type { ServiceGeneratorSchema } from './schema';

interface NormalizedOptions {
  name: string;
  /** e.g. 'identity-service' → pascal 'IdentityService', camel 'identityService' */
  pascalName: string;
  camelName: string;
  port: number;
  needsDatabase: boolean;
  tags: string;
}

function normalize(options: ServiceGeneratorSchema): NormalizedOptions {
  const name = options.name;
  const pascalName = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
  return {
    name,
    pascalName,
    camelName,
    port: options.port ?? 3000,
    needsDatabase: options.needsDatabase ?? true,
    tags: options.tags ?? `scope:${name.split('-')[0]},type:app`,
  };
}

/**
 * Scaffold a production-ready Atlas service.
 *
 * 1. Compose `@nx/nest:app` for the base NestJS scaffold (jest, eslint,
 *    tsconfigs, project config).
 * 2. Overlay the Atlas conventions: Fastify, ConfigModule, LoggerModule,
 *    DatabaseModule, health endpoints, ESM output, and a tsc build.
 */
export async function serviceGenerator(tree: Tree, rawOptions: ServiceGeneratorSchema) {
  const options = normalize(rawOptions);
  const projectRoot = `apps/${options.name}`;

  // 1. Base NestJS application.
  await nestAppGenerator(tree, {
    directory: projectRoot,
    name: options.name,
    unitTestRunner: 'jest',
    e2eTestRunner: 'none',
    linter: 'eslint',
    strict: true,
    useProjectJson: true,
    tags: options.tags,
  });

  // 2. Overlay Atlas template files (mirrors projectRoot: src/ + Dockerfile).
  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    tmpl: '',
    ...options,
  });

  // 3. Make the package ESM + Fastify, drop express, add Atlas deps.
  updateJson(tree, `${projectRoot}/package.json`, (json) => {
    json.type = 'module';
    delete json.dependencies['@nestjs/platform-express'];
    json.dependencies['@nestjs/platform-fastify'] = '^11.0.0';
    json.dependencies['@fastify/static'] = '^8.0.0';
    json.dependencies['@fastify/view'] = '^11.0.0';
    json.dependencies['nestjs-pino'] = '^4.6.1';
    json.dependencies['pino'] = '^10.3.1';
    json.dependencies['zod'] = '^4.4.3';
    json.dependencies['@atlas/config'] = 'workspace:*';
    json.dependencies['@atlas/logger'] = 'workspace:*';
    json.dependencies['@atlas/shared'] = 'workspace:*';
    if (options.needsDatabase) {
      json.dependencies['@atlas/database'] = 'workspace:*';
      json.dependencies['drizzle-orm'] = '^0.45.2';
      json.dependencies['postgres'] = '^3.4.9';
      json.devDependencies['@testcontainers/postgresql'] = '^12.1.0';
      json.devDependencies['testcontainers'] = '^12.1.0';
      json.devDependencies['drizzle-kit'] = '^0.31.10';
      json.scripts = {
        ...json.scripts,
        'db:generate': 'drizzle-kit generate',
        'db:push': 'drizzle-kit push',
        'db:migrate': 'drizzle-kit migrate',
      };
    }
    return json;
  });

  // 4. Switch the build from webpack to tsc (ESM output).
  const projectConfig = readProjectConfiguration(tree, options.name);
  projectConfig.targets = projectConfig.targets ?? {};
  projectConfig.targets['build'] = {
    executor: 'nx:run-commands',
    options: {
      command: 'tsc --build tsconfig.app.json',
      cwd: projectRoot,
    },
  };
  projectConfig.targets['serve'] = {
    continuous: true,
    executor: '@nx/js:node',
    defaultConfiguration: 'development',
    dependsOn: ['build'],
    options: {
      buildTarget: `${options.name}:build`,
      runBuildTargetDependencies: false,
    },
  };
  updateProjectConfiguration(tree, options.name, projectConfig);

  // 5. tsc must emit runtime JS (base config emits declarations only).
  updateJson(tree, `${projectRoot}/tsconfig.app.json`, (json) => {
    json.compilerOptions = {
      ...json.compilerOptions,
      target: 'es2022',
      emitDeclarationOnly: false,
    };
    return json;
  });

  // 6. Remove the webpack config (no longer used).
  tree.delete(`${projectRoot}/webpack.config.js`);

  // 7. Nest scaffolds ESM-incompatible bare relative imports in the files it
  //    generates — add explicit `.js` extensions.
  const fixRelativeImports = [
    'src/app/app.controller.ts',
    'src/app/app.service.ts',
    'src/app/app.controller.spec.ts',
    'src/app/app.service.spec.ts',
  ];
  for (const file of fixRelativeImports) {
    const p = `${projectRoot}/${file}`;
    if (tree.exists(p)) {
      const content = tree.read(p, 'utf-8');
      if (content) {
        tree.write(
          p,
          content.replace(/from '(\.[^']*)'/g, "from '$1.js'"),
        );
      }
    }
  }

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default serviceGenerator;
