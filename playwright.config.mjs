import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'test/browser',timeout:30000,fullyParallel:false,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',serviceWorkers:'block',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'iphone',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},{name:'safari',use:{...devices['iPhone 13']}},{name:'small-mobile',use:{viewport:{width:320,height:740},isMobile:true,hasTouch:true}}],
 webServer:{command:'node start.mjs',url:'http://127.0.0.1:4173/api/health',reuseExistingServer:false,env:{PORT:'4173',NODE_ENV:'test',SUPABASE_URL:'https://agxffllgcahbacvxhqua.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'',FOOTBALL_DATA_TOKEN:''}}
});
