# Remote deploy from this PC: optional git push, then SSH -> git pull + docker compose.
# Prerequisite: SSH key access to the server (same as: ssh root@YOUR_HOST)
#
# Usage:
#   .\deploy-remote.ps1 -RemoteHost hexalyte.com
#   $env:DEPLOY_HOST = "hexalyte.com"; $env:DEPLOY_USER = "root"; .\deploy-remote.ps1
#
# Optional: $env:DEPLOY_PATH = "/root/zanesalon"
# Skip local push: .\deploy-remote.ps1 -RemoteHost hexalyte.com -SkipPush

param(
  [string]$RemoteHost,
  [string]$User,
  [string]$AppPath,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

$h = $RemoteHost
if (-not $h) { $h = $env:DEPLOY_HOST }
if (-not $h) {
  Write-Host "Set the server hostname or IP, e.g.:" -ForegroundColor Yellow
  Write-Host '  .\deploy-remote.ps1 -RemoteHost hexalyte.com' -ForegroundColor Cyan
  Write-Host '  $env:DEPLOY_HOST = "YOUR_SERVER_IP"; .\deploy-remote.ps1' -ForegroundColor Cyan
  exit 1
}

$u = $User
if (-not $u) { $u = $env:DEPLOY_USER }
if (-not $u) { $u = "root" }

$p = $AppPath
if (-not $p) { $p = $env:DEPLOY_PATH }
if (-not $p) { $p = "/root/zanesalon" }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not $SkipPush) {
  Write-Host "Pushing master to origin..." -ForegroundColor Green
  git push origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$remoteCmd = "set -e; cd `"$p`" && git pull origin main && docker compose down && docker compose up -d --build && docker compose ps"
$target = "${u}@${h}"

Write-Host "Connecting to $target (app: $p)..." -ForegroundColor Green
ssh $target $remoteCmd
exit $LASTEXITCODE
