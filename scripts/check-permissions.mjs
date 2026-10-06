// CI helper: print which service account Deploy uses and which of the
// permissions `firebase deploy` needs it is missing, so a 403 is easy to fix.
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const NEEDED = [
  'serviceusage.services.get',
  'firebasehosting.sites.update',
  'firebaserules.rulesets.create',
  'firebaserules.releases.update',
  'datastore.indexes.create',
];

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();
const res = await client.request({
  url: 'https://cloudresourcemanager.googleapis.com/v1/projects/' + sa.project_id + ':testIamPermissions',
  method: 'POST',
  data: { permissions: NEEDED },
}).catch((e) => ({ data: { error: e.message } }));

const has = new Set(res.data.permissions || []);
const missing = NEEDED.filter((p) => !has.has(p));
console.log('Service account: ' + sa.client_email);
if (res.data.error) console.log('Could not check permissions: ' + res.data.error);
else if (!missing.length) console.log('All deploy permissions present.');
else {
  console.log('Missing: ' + missing.join(', '));
  console.log('Fix: https://console.cloud.google.com/iam-admin/iam?project=' + sa.project_id
    + ' > Grant access > principal ' + sa.client_email + ' > roles "Service Usage Consumer", "Cloud Datastore Index Admin", "Firebase Rules Admin", "Firebase Hosting Admin".');
}
