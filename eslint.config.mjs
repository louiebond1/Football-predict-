import globals from 'globals';
export default [{ignores:['node_modules/**','public/vendor/**','test-results/**']},{files:['**/*.js','**/*.mjs'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error'}},{files:['scripts/sw-template.js'],languageOptions:{globals:{CACHE:'readonly',CORE:'readonly'}}}];
