$ErrorActionPreference = 'Stop'
$installDir = 'C:\tools'
$dcBat = Join-Path $installDir 'dependency-check\bin\dependency-check.bat'

if (Test-Path $dcBat) {
    Write-Host "Already installed at $dcBat"
    & $dcBat --version
    exit 0
}

Write-Host 'Downloading dependency-check 12.2.2...'
$url = 'https://github.com/dependency-check/DependencyCheck/releases/download/v12.2.2/dependency-check-12.2.2-release.zip'
$zip = Join-Path $env:TEMP 'dependency-check-12.2.2-release.zip'

Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Write-Host 'Extracting to C:\tools\...'
Expand-Archive -Path $zip -DestinationPath $installDir -Force
Remove-Item $zip -Force
Write-Host 'Done'
& $dcBat --version
