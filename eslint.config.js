export default [
  {
    files: ['**/*.js', '**/*.vue'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
];
