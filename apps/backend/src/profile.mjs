export function validateProfile(input) {
  if(!input||typeof input!=='object')throw Object.assign(new Error('Profile details are required.'),{status:400});
  const fullName=typeof input.fullName==='string'?input.fullName.trim():'';
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  if(fullName.length<2||fullName.length>150)throw Object.assign(new Error('Full name must contain 2–150 characters.'),{status:400});
  if(email.length>191||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(new Error('Enter a valid email address.'),{status:400});
  return {fullName,email};
}

export async function updateProfile(auth,db,id,input) {
  const next=validateProfile(input);
  const current=await auth.getUser(String(id));
  try {
    await auth.updateUser(String(id),{displayName:next.fullName,email:next.email});
  } catch(error) {
    if(error.code==='auth/email-already-exists')throw Object.assign(new Error('That email address is already used by another account.'),{status:409});
    throw error;
  }
  try {
    const updatedAt=new Date();
    await db.collection('users').doc(String(id)).update({full_name:next.fullName,email:next.email,updated_at:updatedAt});
    const profile=await db.collection('users').doc(String(id)).get();
    return {id:profile.id,...profile.data()};
  } catch(error) {
    await auth.updateUser(String(id),{displayName:current.displayName||null,email:current.email}).catch(()=>{});
    throw error;
  }
}
