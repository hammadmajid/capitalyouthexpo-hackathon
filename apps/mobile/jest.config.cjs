module.exports = {
  preset: 'jest-expo',
  testTimeout: 30000,
  collectCoverage: true,
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/observability/sdk.ts', 'src/components/failure-boundary.tsx'],
  coverageDirectory: 'coverage/components',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { lines: 90, statements: 90, branches: 85, functions: 80 } },
  transform: { '^.+\\.mjs$': 'babel-jest' },
  testMatch: ['**/*.component.spec.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-router.cjs'],
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|expo-.*|@hsm/.*|@sentry/.*|nativewind|lucide-react-native|react-native-css-interop|react-native-reanimated|react-native-worklets|@react-navigation/.*|react-native-svg|standard-navigation)/)',
  ],
};
