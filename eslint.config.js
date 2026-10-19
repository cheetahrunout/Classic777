import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/server/src/casino/**', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // Outcomes come from the server's CSPRNG; the page's cosmetics use crypto (rule 3).
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use rng from the casino SDK (server) or jitter() (cosmetics).' }],
      'vue/no-v-html': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
