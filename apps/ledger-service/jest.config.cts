const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'ledger-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  // Resolve @atlas/* workspace packages to their TypeScript source so swc
  // transforms them (jest won't transform compiled ESM in node_modules).
  moduleNameMapper: {
    '^@atlas/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
  // uuid ships ESM-only. It resolves through pnpm's .pnpm dir
  // (node_modules/.pnpm/uuid@.../node_modules/uuid/dist-node/*.js), so allow
  // jest to transform any node_modules path whose rest contains /uuid/.
  transformIgnorePatterns: [
    'node_modules/(?!.*uuid.*)',
  ],
};
