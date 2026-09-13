async function readAll(sb,table,groupId){
 const rows=[];
 for(let from=0;;from+=500){
   const {data,error}=await sb.from(table).select('*').eq('group_id',groupId).order('gameweek_id').order('user_id').range(from,from+499);
   if(error)throw error;
   rows.push(...data||[]);if(!data||data.length<500)return rows;
 }
}
export async function readStandings(sb,groupId){
 const [live,snapshots]=await Promise.all([readAll(sb,'group_leaderboard',groupId),readAll(sb,'gameweek_standings_snapshots',groupId)]);
 const closed=new Set(snapshots.map(r=>String(r.gameweek_id)));
 return [...live.filter(r=>!closed.has(String(r.gameweek_id))),...snapshots];
}
