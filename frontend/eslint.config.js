import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import parserTs from '@typescript-eslint/parser';
import pluginTs from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default [
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: parserTs,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': pluginTs,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
];
