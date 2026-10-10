import { firebaseAuth } from '../src/firebase.mjs';

// Apply at the identity provider so direct Firebase requests cannot bypass the
// registration, reset-password, and first-login rules in our clients.
const manager = firebaseAuth.projectConfigManager();
const policy = {
  enforcementState: 'ENFORCE', forceUpgradeOnSignin: false,
  constraints: { minLength: 8, maxLength: 128, requireUppercase: true, requireNumeric: true, requireLowercase: false, requireNonAlphanumeric: false }
};
try {
  const before = await manager.getProjectConfig();
  if (process.argv.includes('--apply')) {
    const after = await manager.updateProjectConfig({ passwordPolicyConfig: policy });
    console.log(JSON.stringify({ projectId: process.env.FIREBASE_PROJECT_ID, applied: true, policy: after.passwordPolicyConfig }, null, 2));
  } else console.log(JSON.stringify({ projectId: process.env.FIREBASE_PROJECT_ID, current: before.passwordPolicyConfig || null, requested: policy }, null, 2));
} catch (error) {
  console.error(`Password policy configuration failed (${error.code || 'ERROR'}): ${error.message}`);
  process.exitCode = 1;
}
