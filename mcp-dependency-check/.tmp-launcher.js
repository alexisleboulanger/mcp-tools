const { spawnSync } = require('child_process');
require('./src/config.js');
const key = process.env.NVD_API_KEY;
if (typeof key !== 'string' || key.trim().length === 0) { console.error('NVD_API_KEY_PRESENT=false'); process.exit(2); }
console.log('NVD_API_KEY_PRESENT=true');
const r = spawnSync(process.argv[2], ['--updateonly'], { stdio: 'inherit', env: process.env, shell: true });
if (r.error) { console.error(r.error.message); process.exit(1); }
process.exit(r.status === null ? 1 : r.status);
