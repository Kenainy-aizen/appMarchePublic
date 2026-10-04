import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

const forbid = (groups) => ({
  'no-restricted-imports': ['error', { patterns: groups }]
})

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }]
    }
  },
  { files: ['*.config.ts', '*.config.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  // --- Règles d'architecture : les dépendances vont toujours vers l'intérieur ---
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid([
      {
        group: [
          '@application/*',
          '@infrastructure/*',
          '**/application/**',
          '**/infrastructure/**',
          '**/main/**',
          '**/renderer/**',
          'electron',
          'react',
          'react-dom'
        ],
        message: 'Le domaine est du TypeScript pur : aucune dépendance vers les couches externes.'
      }
    ])
  },
  {
    files: ['src/application/**/*.ts'],
    rules: forbid([
      {
        group: [
          '@infrastructure/*',
          '**/infrastructure/**',
          '**/main/**',
          '**/renderer/**',
          'electron',
          'react',
          'react-dom'
        ],
        message: "L'application ne dépend que du domaine, via des interfaces (ports)."
      }
    ])
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: forbid([
      {
        group: ['zod', '@domain/*', '@application/*', '@infrastructure/*', '**/ipc-schemas'],
        message:
          'Le preload sandboxé ne peut charger que electron : pas de bibliothèque tierce ni de logique.'
      }
    ])
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...forbid([
        {
          group: ['@domain/*', '@application/*', '@infrastructure/*', '**/main/**', 'electron'],
          message: "L'interface n'a accès qu'à @shared et à window.api (aucune logique métier)."
        }
      ])
    }
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/infrastructure/**/*.ts',
      'tests/**/*.ts'
    ],
    languageOptions: { globals: globals.node }
  },
  prettier
)
