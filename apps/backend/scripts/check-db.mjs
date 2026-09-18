import {firebaseAuth,firestore,requireFirebaseConfig} from '../src/firebase.mjs';

try{
  requireFirebaseConfig();
  const [users,authUsers]=await Promise.all([firestore.collection('users').limit(2).get(),firebaseAuth.listUsers(1)]);
  console.log(`Connected to Firebase project ${process.env.FIREBASE_PROJECT_ID}. Firestore profiles: ${users.size}; Firebase Auth users: ${authUsers.users.length}${authUsers.pageToken?'+':''}.`);
  if(users.empty)console.log('Create your first owner with npm run user:create.');
}catch(error){console.error(error.code||error.message);process.exitCode=1;}
