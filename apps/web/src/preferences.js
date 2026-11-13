export const preferenceDefaults=Object.freeze({autoRefresh:true,reportPeriod:'365d',reportGrouping:'monthly'});
const key='rent-play-workspace-preferences';
export function normalizePreferences(value={}) {
  return {
    autoRefresh:typeof value?.autoRefresh==='boolean'?value.autoRefresh:true,
    reportPeriod:['7d','30d','90d','365d'].includes(value?.reportPeriod)?value.reportPeriod:'365d',
    reportGrouping:['auto','daily','weekly','monthly'].includes(value?.reportGrouping)?value.reportGrouping:'monthly'
  };
}
export function readPreferences(storage) {
  try{return normalizePreferences(JSON.parse(storage.getItem(key)));}catch{return {...preferenceDefaults};}
}
export function writePreferences(storage,value) {
  const preferences=normalizePreferences(value);
  storage.setItem(key,JSON.stringify(preferences));
  return preferences;
}
