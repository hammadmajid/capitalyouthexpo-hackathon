import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import css from '@eslint/css';
import { tailwind3 } from 'tailwind-csstree';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import foundation from './rules.mjs';

const scripts = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  security.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    plugins: { 'no-secrets': noSecrets, boundaries, foundation },
    settings: {
      'boundaries/root-path': fileURLToPath(new URL('../..', import.meta.url)),
      'boundaries/include': ['apps/**/*', 'packages/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*', capture: ['app'] },
        { type: 'package', pattern: 'packages/*', capture: ['package'] },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      'foundation/file-size-target': 'warn',
      'no-secrets/no-secrets': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 10],
      // Apps never import other apps; shared packages never import apps (development rules §2).
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: {
                to: [
                  { element: { type: 'package' } },
                  {
                    element: {
                      type: 'app',
                      captured: { app: '{{ from.element.captured.app }}' },
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: 'package' } },
              allow: { to: { element: { type: 'package' } } },
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
          message: 'Narrow unknown inputs.',
        },
        {
          // eslint-disable-next-line no-secrets/no-secrets -- Public React property in an AST selector, not a credential.
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Use safe React text rendering.',
        },
      ],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'foundation/no-app-hex': 'error',
      'no-restricted-imports': ['error', { patterns: ['../../apps/*', '@hsm/*/src/*'] }],
    },
  },
  {
    files: ['packages/api-client/src/generated/**'],
    rules: { 'max-lines': 'off', 'foundation/file-size-target': 'off' },
  },
  { files: ['apps/web/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    // Expo tooling requires CommonJS config files; TypeScript source keeps import enforcement.
    files: ['apps/mobile/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);

export default defineConfig([
  ...scripts.map((config) =>
    config.files || (config.ignores && Object.keys(config).length === 1)
      ? config
      : { ...config, files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'] },
  ),
  {
    files: ['apps/**/*.css'],
    language: 'css/css',
    languageOptions: { customSyntax: tailwind3 },
    plugins: { css, foundation },
    rules: {
      'css/no-empty-blocks': 'error',
      'css/no-important': 'error',
      'css/no-duplicate-imports': 'error',
      'foundation/no-app-hex': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
]);
