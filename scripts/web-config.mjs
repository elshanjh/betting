// CI helper: if public/config.js still has placeholders, fill in the Firebase
// web config of the project (creating a web app if there is none yet).
// Uses the firebase CLI, authenticated through GOOGLE_APPLICATION_CREDENTIALS.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const project = process.argv[2];
const file = 'public/config.js';
const src = readFileSync(file, 'utf8');
if (!src.includes('PASTE_ME')) { console.log('config.js already filled in'); process.exit(0); }

const fb = (...args) => {
  const out = execFileSync('npx', ['firebase', ...args, '--project', project, '--json'], { encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{'))).result;
};

let app = (fb('apps:list', 'WEB') || [])[0];
if (!app) { console.log('creating a web app'); app = fb('apps:create', 'WEB', 'Friendly Stakes'); }
const res = fb('apps:sdkconfig', 'WEB', app.appId);
let cfg = res.sdkConfig;
if (!cfg) { const t = res.fileContents; cfg = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }

const keep = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const obj = '{\n' + keep.filter((k) => cfg[k]).map((k) => '  ' + k + ': ' + JSON.stringify(cfg[k]) + ',').join('\n') + '\n}';
writeFileSync(file, src.replace(/export const firebaseConfig = \{[\s\S]*?\};/, 'export const firebaseConfig = ' + obj + ';'));
console.log('filled config.js for ' + cfg.projectId);
