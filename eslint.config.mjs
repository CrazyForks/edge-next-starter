import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores (must be first, standalone object with only `ignores`)
  {
    ignores: [
      '.next/**',
      '.vercel/**',
      '.vinext/**',
      '.wrangler/**',
      'node_modules/**',
      'scripts/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends(
    'next/core-web-vitals',
    'next/typescript',
    'plugin:jsx-a11y/recommended'
  ),
  // Allow `any` in test files and type declarations
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', 'types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Allow require() in config files
  {
    files: ['tailwind.config.ts', 'postcss.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
  // Worker entry point
  {
    files: ['worker/**/*.ts'],
    rules: {
      'import/no-anonymous-default-export': 'off',
    },
  },
];

export default eslintConfig;
