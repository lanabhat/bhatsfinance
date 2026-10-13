import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Context/component files export their own hook alongside the provider/component
      // (useApp next to AppProvider, …). That's the usual React pattern; listed by name so
      // any other non-component export still gets flagged.
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: ['useApp', 'useAuth', 'usePrivacy', 'useTerms', 'useTheme', 'useToast',
          'hasModePreference', 'useMaskedFmt', 'useChartTheme'],
      }],
    },
  },
])
