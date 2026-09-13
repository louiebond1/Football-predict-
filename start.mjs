import {server} from './server.mjs';
// Keep scores current even when no browser is open. Never settle pots automatically.
if(process.env.FOOTBALL_DATA_TOKEN){
  let syncing=false;
  const sync=async()=>{if(syncing)return;syncing=true;try{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/football/fixtures`,{signal:AbortSignal.timeout(25000)});
    if(!r.ok)console.error('Scheduled fixture sync unavailable:',r.status);
  }catch{console.error('Scheduled fixture sync unavailable');}finally{syncing=false;}};
  server.once('listening',sync);
  const timer=setInterval(sync,60000);timer.unref();
  server.on('close',()=>clearInterval(timer));
}
