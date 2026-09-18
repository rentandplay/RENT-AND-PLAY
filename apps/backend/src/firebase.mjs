import {applicationDefault, cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

function serviceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  const value=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if(value.private_key)value.private_key=value.private_key.replace(/\\n/g,'\n');
  return value;
}

const account=serviceAccount();
const options={
  credential:account?cert(account):applicationDefault(),
  ...(process.env.FIREBASE_PROJECT_ID?{projectId:process.env.FIREBASE_PROJECT_ID}:{})
};
const app=getApps()[0] || initializeApp(options);

export const firestore=getFirestore(app);
export const firebaseAuth=getAuth(app);
firestore.settings({ignoreUndefinedProperties:true});

export function requireFirebaseConfig() {
  if(!process.env.FIREBASE_PROJECT_ID)throw Object.assign(new Error('FIREBASE_PROJECT_ID is not configured.'),{code:'FIREBASE_CONFIG'});
  if(!process.env.FIREBASE_WEB_API_KEY)throw Object.assign(new Error('FIREBASE_WEB_API_KEY is not configured.'),{code:'FIREBASE_CONFIG'});
}

export function asDate(value) {
  if(!value)return null;
  if(typeof value.toDate==='function')return value.toDate();
  if(value instanceof Date)return value;
  const text=String(value);
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(text)?text:text.replace(' ','T')+'+08:00');
}

export function localDateTime(value) {
  const date=asDate(value);
  if(!date || Number.isNaN(date.getTime()))return null;
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}.${String(date.getMilliseconds()).padStart(3,'0')}`;
}

export const docData=snapshot=>({id:snapshot.id,...snapshot.data()});
export const dateFields=(record,fields)=>Object.fromEntries(Object.entries(record).map(([key,value])=>[key,fields.includes(key)&&value?localDateTime(value):value]));
