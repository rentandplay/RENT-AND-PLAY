import {firebaseAuth,requireFirebaseConfig} from './firebase.mjs';

export const publicUser = row => ({ id: String(row.id), name: row.full_name, email: row.email, role: row.role });

export class FirebaseSessions {
  constructor(auth=firebaseAuth,fetcher=fetch){this.auth=auth;this.fetcher=fetcher;this.revoked=new Set();}
  async signIn(email,password,remember=false) {
    requireFirebaseConfig();
    const response=await this.fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
    });
    if(!response.ok)return null;
    const result=await response.json();
    const seconds=remember?14*86400:8*3600;
    const cookie=await this.auth.createSessionCookie(result.idToken,{expiresIn:seconds*1000});
    return {uid:result.localId,cookie:cookie,seconds};
  }
  async verify(cookie) {
    if(!cookie||this.revoked.has(cookie))return null;
    try{return await this.auth.verifySessionCookie(cookie,true);}catch{return null;}
  }
  revoke(cookie){if(cookie)this.revoked.add(cookie);}
}
