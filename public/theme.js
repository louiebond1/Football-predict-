(() => {
 const key='kickpot-theme-v1',root=document.documentElement;
 const button=document.createElement('button');button.id='kpThemeToggle';button.type='button';button.className='icon-btn';
 function apply(theme){
  root.dataset.kpTheme=theme;
  try{localStorage.setItem(key,theme);}catch{}
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#06130d':'#f4efe4';
  button.textContent=theme==='dark'?'☼':'◐';button.setAttribute('aria-label',theme==='dark'?'Use light mode':'Use dark mode');
 }
 let saved;try{saved=localStorage.getItem(key);}catch{}
 apply(['light','dark'].includes(saved)?saved:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
 button.addEventListener('click',()=>apply(root.dataset.kpTheme==='dark'?'light':'dark'));
 document.querySelector('.topbar-actions').prepend(button);
})();
