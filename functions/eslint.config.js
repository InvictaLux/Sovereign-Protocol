import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      globals: {
        require: 'readonly',
        module: 'readonly',
        console: 'readonly',
        logger: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'off'
    }
  }
]
