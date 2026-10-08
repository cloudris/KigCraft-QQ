// SPDX-License-Identifier: GPL-3.0-or-later
// Integer half-Credits avoid rounding. A period begins Sunday 23:59 Asia/Shanghai.
const WEEK=7*24*60*60*1000;
const ANCHOR=Date.UTC(1970,0,4,15,59);
export function creditPeriod(now){
  const start=ANCHOR+Math.floor((now-ANCHOR)/WEEK)*WEEK;
  return {key:String(start),start,resetsAt:start+WEEK};
}
export function creditBalance(entries,user,config,now){
  const period=creditPeriod(now),limit=config.weeklyCredits??8;
  const exempt=(config.creditExemptUsers||[]).includes(String(user));
  let spent=0,held=0;
  for(const row of Object.values(entries))if(row.user===String(user)&&row.period===period.key){
    if(row.state==='spent')spent+=row.units;
    if(row.state==='held')held+=row.units;
  }
  return {...period,limit,exempt,spent:spent/2,held:held/2,remaining:exempt?null:Math.max(0,limit-(spent+held)/2)};
}
export function generationCreditCost(task){
  return task.versions.some(v=>['preview','refine','local','turnaround'].includes(v.kind))?0.5:1;
}
export function creditSummary(balance){
  if(balance.exempt)return '你的账号免每周 Credit 限额。';
  return `本周剩余 ${balance.remaining}/${balance.limit} Credit${balance.held?`（另有 ${balance.held} Credit 已预留）`:''}，北京时间每周日 23:59 重置。`;
}
