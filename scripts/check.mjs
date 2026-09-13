import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {transform} from 'esbuild';
for(const dir of ['.','public','scripts','test'])for(const f of await readdir(dir)){
 if(!/\.(m?js)$/.test(f))continue;
 const r=spawnSync(process.execPath,['--check',`${dir}/${f}`],{encoding:'utf8'});
 if(r.status){process.stderr.write(r.stderr);process.exitCode=1;}
}
JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
await transform(await readFile('supabase/functions/invite-password-auth/index.ts','utf8'),{loader:'ts'});
console.log('JavaScript syntax and manifest validation complete.');
