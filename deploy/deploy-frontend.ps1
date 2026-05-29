# Deploy admin panel (frontend only) to VPS - build locally, upload dist/.
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File deploy/deploy-frontend.ps1
# Options:
#   -SkipBuild     Upload existing admin-panel/dist without npm run build
#   -NoCleanDist   Do not delete old files in remote dist/ before extract

param(
    [string]$EnvFile = "$PSScriptRoot\deploy.local.env",
    [switch]$SkipBuild,
    [switch]$NoCleanDist
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$PanelDir = Join-Path $ProjectRoot "admin-panel"
$DistDir = Join-Path $PanelDir "dist"

function Get-DeployVar($name, $required = $true) {
    if ($script:DeployVars.ContainsKey($name) -and $script:DeployVars[$name]) {
        return $script:DeployVars[$name].Trim()
    }
    if ($required) { throw "Missing $name in $EnvFile" }
    return ""
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "Create $EnvFile from deploy/deploy.local.env.example first." -ForegroundColor Red
    exit 1
}

$script:DeployVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $script:DeployVars[$k.Trim()] = $v.Trim()
}

$VpsHost = Get-DeployVar "VPS_HOST"
$VpsUser = Get-DeployVar "VPS_USER"
$Domain = Get-DeployVar "DOMAIN"
$Domain = ($Domain -replace '^https?://', '' -replace '/+$', '').Trim()
$AppDir = Get-DeployVar "APP_DIR" $false
if (-not $AppDir) { $AppDir = "/opt/videobot" }
$RemoteDist = "$AppDir/admin-panel/dist"

$SshOpsPy = Join-Path $PSScriptRoot "ssh_ops.py"
$env:DEPLOY_ENV_FILE = $EnvFile
$UsePasswordSsh = [bool](Get-DeployVar "VPS_PASSWORD" $false)

function Invoke-Ssh($Command) {
    if ($UsePasswordSsh) {
        & python $SshOpsPy ssh $Command
    } else {
        $SshPort = Get-DeployVar "SSH_PORT" $false
        if (-not $SshPort) { $SshPort = "22" }
        $SshKey = Get-DeployVar "SSH_KEY" $false
        $target = "${VpsUser}@${VpsHost}"
        $sshArgs = @("-p", $SshPort, "-o", "StrictHostKeyChecking=accept-new")
        if ($SshKey) { $sshArgs += @("-i", $SshKey) }
        & ssh @sshArgs $target $Command
    }
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $Command" }
}

function Invoke-Scp($Source, $Dest) {
    if ($UsePasswordSsh) {
        & python $SshOpsPy scp $Source $Dest
    } else {
        $SshPort = Get-DeployVar "SSH_PORT" $false
        if (-not $SshPort) { $SshPort = "22" }
        $SshKey = Get-DeployVar "SSH_KEY" $false
        $target = "${VpsUser}@${VpsHost}"
        $scpArgs = @("-P", $SshPort, "-o", "StrictHostKeyChecking=accept-new")
        if ($SshKey) { $scpArgs += @("-i", $SshKey) }
        & scp @scpArgs $Source "${target}:${Dest}"
    }
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: $Source -> $Dest" }
}

Write-Host "==> Frontend deploy to ${VpsUser}@${VpsHost}:${RemoteDist}"
Invoke-Ssh "echo ok"

if (-not $SkipBuild) {
    Write-Host "==> Building admin panel ..."
    $panelEnv = Join-Path $PanelDir ".env"
    $panelEnvBackup = Join-Path $PanelDir ".env.deploy-backup"
    $exampleEnv = Join-Path $ProjectRoot "deploy\admin-panel.env.production.example"
    if (Test-Path $panelEnv) {
        Copy-Item $panelEnv $panelEnvBackup -Force
    }
    Copy-Item $exampleEnv $panelEnv -Force
    Push-Location $PanelDir
    if (-not (Test-Path "node_modules\.bin\tsc.cmd")) {
        Write-Host "    Running npm ci ..."
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    Pop-Location
    if (Test-Path $panelEnvBackup) {
        Move-Item $panelEnvBackup $panelEnv -Force
    }
}

$distIndex = Join-Path $DistDir "index.html"
if (-not (Test-Path $distIndex)) {
    throw "Missing $distIndex - run without -SkipBuild or build manually."
}

Write-Host "==> Packaging dist/ ..."
$archive = Join-Path $env:TEMP "admin-dist.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }
& tar -czf $archive -C $DistDir .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

Write-Host "==> Uploading to VPS ..."
Invoke-Scp $archive "$AppDir/admin-dist.tar.gz"

$archivePath = "$AppDir/admin-dist.tar.gz"
if ($NoCleanDist) {
    $extractCmd = "mkdir -p $RemoteDist; tar -xzf $archivePath -C $RemoteDist; rm -f $archivePath"
} else {
    Write-Host "    Cleaning old dist/ on VPS (removes stale hashed assets) ..."
    $extractCmd = "mkdir -p $RemoteDist; rm -rf $RemoteDist/*; tar -xzf $archivePath -C $RemoteDist; rm -f $archivePath"
}
Invoke-Ssh $extractCmd

Remove-Item $archive -Force -ErrorAction SilentlyContinue

$siteUrl = if ($Domain) { "https://$Domain" } else { "https://YOUR_DOMAIN" }
Write-Host ""
Write-Host "Done. Open: $siteUrl" -ForegroundColor Green
Write-Host "Hard refresh in browser: Ctrl+Shift+R"
