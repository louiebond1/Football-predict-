import globals from 'globals';
export default [{ignores:['node_modules/**','public/vendor/**','test-results/**']},{files:['**/*.js','**/*.mjs'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error',
  /* window.screen, window.name and window.length are easy to hit by accident:
     several modules declare a local `const screen = querySelector('#screen')`
     inside one function, so a reference outside it silently resolves to the
     global instead of failing. That shipped once - a listener added to
     window.screen, which Chromium's Screen (an EventTarget) accepted and
     WebKit's did not, throwing at module load and taking the whole Matchday
     controller with it. A shadowing local is still fine; only the bare
     global is flagged. */
  'no-restricted-globals':['error','screen','name','length']}},{files:['scripts/sw-template.js'],languageOptions:{globals:{CACHE:'readonly',CORE:'readonly'}}}];
