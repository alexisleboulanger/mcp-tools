$ErrorActionPreference = 'Stop'
$ids = @(18540, 7844)
$names = @{18540='java'; 7844='powershell'}
foreach ($id in $ids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -ne $p) {
    if ($p.ProcessName -ne $names[$id]) { throw "Unexpected process at PID $id" }
    $p.Kill()
    if (-not $p.WaitForExit(30000)) { throw "PID $id did not terminate" }
  }
}
foreach ($id in $ids) { if ($null -ne (Get-Process -Id $id -ErrorAction SilentlyContinue)) { throw "PID $id remains" } }
$data = Join-Path (Get-Location) 'tools\dependency-check\data'
$lock = Join-Path $data 'odc.update.lock'
if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force }
$cli = Join-Path (Get-Location) 'tools\dependency-check\bin\dependency-check.bat'
if (-not (Test-Path -LiteralPath $cli)) { throw "CLI not found: $cli" }
$launcher = Join-Path (Get-Location) '.tmp-launcher.js'
@'
const { spawnSync } = require('child_process');
require('./src/config.js');
const key = process.env.NVD_API_KEY;
if (typeof key !== 'string' || key.trim().length === 0) { console.error('NVD_API_KEY_PRESENT=false'); process.exit(2); }
console.log('NVD_API_KEY_PRESENT=true');
const r = spawnSync(process.argv[2], ['--updateonly'], { stdio: 'inherit', env: process.env, shell: true });
if (r.error) { console.error(r.error.message); process.exit(1); }
process.exit(r.status === null ? 1 : r.status);
'@ | Set-Content -LiteralPath $launcher -Encoding UTF8
try { & node $launcher $cli; $rc = $LASTEXITCODE } finally { Remove-Item -LiteralPath $launcher -Force -ErrorAction SilentlyContinue }
$lockState = if (Test-Path -LiteralPath $lock) {'exists'} else {'absent'}
$db = Join-Path $data 'odc.mv.db'
$stamp = if (Test-Path -LiteralPath $db) {(Get-Item -LiteralPath $db).LastWriteTime.ToString('o')} else {'not found'}
"UPDATE_EXIT_CODE=$rc"
"LOCK_STATE=$lockState"
"ODC_MV_DB_TIMESTAMP=$stamp"
exit $rc
