import { readFile } from 'node:fs/promises';
import FirestorePackage from '@google-cloud/firestore';
import { createRequire } from 'node:module';
import path from 'node:path';
const {v1}=FirestorePackage;
const projectId=process.env.FIREBASE_PROJECT_ID;
if(projectId!=='rent-and-play')throw new Error('Index operations require the rent-and-play project.');
const apply=process.argv.includes('--apply');
const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON):null;
let client,cliApi;
if(process.argv.includes('--cli')){
  const require=createRequire(import.meta.url),root=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
  const account=require(path.join(root,'auth.js')).getGlobalDefaultAccount();
  if(!account?.user || !account?.tokens)throw new Error('Sign in to Firebase CLI with a project account that can create Firestore indexes.');
  await require(path.join(root,'requireAuth.js')).requireAuth({project:projectId,...account,nonInteractive:true});
  cliApi=new (require(path.join(root,'firestore/api.js')).FirestoreApi)();
}else client=new v1.FirestoreAdminClient({projectId,...(credentials?.client_email?{credentials}: {})});
const root=`projects/${projectId}/databases/(default)/collectionGroups`;
const existing=cliApi?await cliApi.listIndexes(projectId):(await client.listIndexes({parent:root+'/-'}))[0];
const config=JSON.parse(await readFile(new URL('../../../firestore.indexes.json',import.meta.url),'utf8'));
const key=index=>JSON.stringify([index.queryScope===1?'COLLECTION':index.queryScope,index.fields.filter(field=>field.fieldPath!=='__name__').map(field=>[field.fieldPath,field.order===1?'ASCENDING':field.order===2?'DESCENDING':field.order||field.arrayConfig])]);
const missing=config.indexes.filter(index=>!existing.some(row=>row.name.split('/collectionGroups/')[1].split('/')[0]===index.collectionGroup&&key(row)===key(index)));
console.log(JSON.stringify({apply,configured:config.indexes.length,missing:missing.length,building:existing.filter(row=>row.state===1||row.state==='CREATING').length}));
if(apply)for(const index of missing){
  try{if(cliApi)await cliApi.createIndex(projectId,index);else await client.createIndex({parent:root+'/'+index.collectionGroup,index:{queryScope:index.queryScope,fields:index.fields}});console.log(`Index requested: ${index.collectionGroup} (${index.fields.map(field=>field.fieldPath).join(', ')})`);}
  catch(error){if(error.code!==6)throw error;}
}
if(client)await client.close();
