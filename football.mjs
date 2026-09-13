export const finalStatus=s=>['FT','AET','PEN'].includes(String(s||'').toUpperCase());
export function validateMatches(matches){
 if(!Array.isArray(matches))throw new Error('Invalid fixture feed');
 for(const m of matches){
  if(!Number.isInteger(m.id)||m.id<=0||!Number.isFinite(Date.parse(m.utcDate))||!m.homeTeam?.id||!m.awayTeam?.id||!(m.homeTeam.name||m.homeTeam.shortName)||!(m.awayTeam.name||m.awayTeam.shortName)||typeof m.status!=='string')throw new Error('Invalid fixture');
  for(const score of [m.score?.fullTime?.home,m.score?.fullTime?.away])if(score!=null&&(!Number.isInteger(score)||score<0))throw new Error('Invalid score');
 }
 return matches;
}
export function chooseRound(providerRound,gameweeks=[]){
  const weeks=gameweeks.filter(g=>/^Matchday \d+$/.test(g.round_name)).sort((a,b)=>Number(a.round_name.split(' ')[1])-Number(b.round_name.split(' ')[1]));
  const active=weeks.find(g=>g.fixtures?.some(f=>!finalStatus(f.status)));
  if(active)return Number(active.round_name.split(' ')[1]);
  const last=weeks.filter(g=>g.fixtures?.length).at(-1);
  return last?Math.min(38,Math.max(Number(providerRound)||1,Number(last.round_name.split(' ')[1])+1)):Number(providerRound)||null;
}
