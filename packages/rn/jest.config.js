module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Runs before any test module loads so picocolors sees FORCE_COLOR=1 and
  // ANSI-aware assertions are deterministic in CI (where stdout is not a TTY).
  setupFiles: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  // Coverage gate: `npm run test:coverage` fails CI when a PR drops overall
  // coverage below these thresholds (measured on the full suite, July 2026).
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 84,
      branches: 71,
      functions: 87,
      lines: 85,
    },
  },
}
