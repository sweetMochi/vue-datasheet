import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // typescript-eslint 只對 .ts 關掉 no-undef，.vue 沒被涵蓋到，
      // 於是 File、Event、HTMLInputElement 這些瀏覽器型別會被誤判成未定義。
      // 真正的未定義識別字由 vue-tsc 擋，這裡關掉不會少防到什麼
      'no-undef': 'off',
      // 排版一律由 Prettier 決定，這三條只會跟它互相改回去
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
)
