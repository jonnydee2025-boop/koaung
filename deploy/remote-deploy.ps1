# Deploy VideoBot from Windows to your VPS over SSH.
# Prerequisites:
#   - OpenSSH client (ssh, scp) - built into Windows 10+
#   - deploy/deploy.local.env filled in
#   - DNS A record: DOMAIN -> VPS_HOST (before certbot step)
#   - token.json + client_secret.json in project root (from local OAuth)
#   - .env in project root with production values (or edit on VPS after)

param(
    [string]$EnvFile = "$PSScriptRoot\deploy.local.env",
    [switch]$SkipCertbot,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path

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
if (-not $Domain) { throw "DOMAIN is empty in $EnvFile (use hostname only, e.g. jexbot.site)" }
$AppDir = Get-DeployVar "APP_DIR" $false
if (-not $AppDir) { $AppDir = "/opt/videobot" }
$SshPort = Get-DeployVar "SSH_PORT" $false
if (-not $SshPort) { $SshPort = "22" }
$SshKey = Get-DeployVar "SSH_KEY" $false

$VpsPassword = Get-DeployVar "VPS_PASSWORD" $false
$SkipCertbotFlag = (Get-DeployVar "DEPLOY_SKIP_CERTBOT" $false) -eq "true"
if ($SkipCertbot) { $SkipCertbotFlag = $true }

$SshTarget = "${VpsUser}@${VpsHost}"
$SshArgs = @("-p", $SshPort, "-o", "StrictHostKeyChecking=accept-new")
$ScpArgs = @("-P", $SshPort, "-o", "StrictHostKeyChecking=accept-new")
if ($SshKey) {
    $SshArgs += @("-i", $SshKey)
    $ScpArgs += @("-i", $SshKey)
}

$UsePasswordSsh = [bool]$VpsPassword
$SshOpsPy = Join-Path $PSScriptRoot "ssh_ops.py"
$env:DEPLOY_ENV_FILE = $EnvFile

function Invoke-Ssh($Command) {
    if ($UsePasswordSsh) {
        & python $SshOpsPy ssh $Command
    } else {
        & ssh @SshArgs $SshTarget $Command
    }
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $Command" }
}

function Invoke-Scp($Source, $Dest) {
    if ($UsePasswordSsh) {
        & python $SshOpsPy scp $Source $Dest
    } else {
        & scp @ScpArgs -r $Source "${SshTarget}:${Dest}"
    }
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: $Source -> $Dest" }
}

Write-Host "==> Testing SSH to $SshTarget ..."
Invoke-Ssh "echo ok"

# Build admin panel locally
if (-not $SkipBuild) {
    Write-Host "==> Building admin panel ..."
    $panelEnv = Join-Path $ProjectRoot "admin-panel\.env"
    $panelEnvBackup = Join-Path $ProjectRoot "admin-panel\.env.deploy-backup"
    $exampleEnv = Join-Path $ProjectRoot "deploy\admin-panel.env.production.example"
    if (Test-Path $panelEnv) {
        Copy-Item $panelEnv $panelEnvBackup -Force
    }
    Copy-Item $exampleEnv $panelEnv -Force
    Write-Host "    Production build uses empty VITE_ADMIN_API_KEY (login screen on first visit)"
    Push-Location (Join-Path $ProjectRoot "admin-panel")
    $distIndex = Join-Path (Get-Location) "dist\index.html"
    npm ci 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    npm ci failed - using existing node_modules if present" -ForegroundColor Yellow
    }
    if (Test-Path "node_modules\.bin\tsc.cmd") {
        & npm run build
    } else {
        Write-Host "    node_modules incomplete - skipping rebuild; upload existing dist/" -ForegroundColor Yellow
    }
    if (-not (Test-Path $distIndex)) {
        throw "Admin panel build failed - dist/index.html missing"
    }
    Pop-Location
    if (Test-Path $panelEnvBackup) {
        Move-Item $panelEnvBackup $panelEnv -Force
    }
}

# Upload project archive (exclude heavy dirs)
Write-Host "==> Uploading project to $AppDir ..."
$archive = Join-Path $env:TEMP "videobot-deploy.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }

$tarArgs = @(
    "-czf", $archive,
    "--exclude=node_modules",
    "--exclude=.venv",
    "--exclude=tmp_video_jobs",
    "--exclude=admin-panel/node_modules",
    "--exclude=.git",
    "-C", $ProjectRoot,
    "video_bot", "video_automation_bot.py", "requirements-video-automation.txt",
    "deploy", "admin-panel/dist", "admin-panel/package.json", "admin-panel/package-lock.json",
    "admin-panel/index.html", "admin-panel/vite.config.js", "admin-panel/src"
)
& tar @tarArgs
if ($LASTEXITCODE -ne 0) {
    throw "tar failed. Install tar (Windows 10+ usually has it) or upload via git clone on the VPS."
}

Invoke-Ssh "mkdir -p $AppDir"
Invoke-Scp $archive "${AppDir}/videobot-deploy.tar.gz"
Invoke-Ssh ('cd {0} && tar -xzf videobot-deploy.tar.gz && rm -f videobot-deploy.tar.gz' -f $AppDir)

# OAuth files (create these on your PC first)
foreach ($file in @("token.json", "client_secret.json")) {
    $local = Join-Path $ProjectRoot $file
    if (Test-Path $local) {
        Write-Host "==> Uploading $file ..."
        Invoke-Scp $local "${AppDir}/$file"
    } else {
        Write-Host "    WARNING: $file not found - Google/YouTube will not work until you add it." -ForegroundColor Yellow
    }
}

# .env: use Linux production template (local Windows .env paths break on VPS)
$useLocalEnv = (Get-DeployVar "DEPLOY_USE_LOCAL_ENV" $false) -eq "true"
$localEnv = Join-Path $ProjectRoot ".env"
if ($useLocalEnv -and (Test-Path $localEnv)) {
    Write-Host "==> Uploading local .env (DEPLOY_USE_LOCAL_ENV=true) ..."
    Invoke-Scp $localEnv "${AppDir}/.env"
} else {
    Invoke-Scp (Join-Path $ProjectRoot "deploy\.env.production.example") "${AppDir}/.env"
    $secretsFile = Join-Path $PSScriptRoot "deploy.secrets.env"
    if (Test-Path $secretsFile) {
        Write-Host "==> Merging deploy/deploy.secrets.env into remote .env ..."
        Invoke-Scp $secretsFile "${AppDir}/deploy.secrets.env"
        Invoke-Ssh ('bash {0}/deploy/merge-secrets.sh {0}/.env {0}/deploy.secrets.env; rm -f {0}/deploy.secrets.env' -f $AppDir)
    } else {
        Write-Host "    Tip: copy deploy/deploy.secrets.env.example -> deploy/deploy.secrets.env with your tokens" -ForegroundColor Yellow
    }
}

# Thumbnail from .env THUMBNAIL_TEMPLATE path if exists
$rootEnv = Join-Path $ProjectRoot ".env"
if (Test-Path $rootEnv) {
    foreach ($line in Get-Content $rootEnv) {
        if ($line -match '^THUMBNAIL_TEMPLATE=(.+)$') {
            $thumb = $Matches[1].Trim()
            if ($thumb -and (Test-Path $thumb)) {
                Invoke-Ssh "mkdir -p ${AppDir}/assets"
                Invoke-Scp $thumb "${AppDir}/assets/thumbnail_template.jpg"
            }
        }
    }
}

# Run server-side install
Write-Host "==> Running install on VPS ..."
Invoke-Ssh "DOMAIN='$Domain' APP_DIR='$AppDir' bash ${AppDir}/deploy/install.sh"

# Production .env if not uploaded
Invoke-Ssh ('test -f {0}/.env || cp {0}/deploy/.env.production.example {0}/.env' -f $AppDir)

# Patch domain in .env CORS if placeholder remains
$corsOrigin = if ($Domain -match '^\d+\.\d+\.\d+\.\d+$') { "http://${Domain}" } else { "https://${Domain}" }
Invoke-Ssh ('sed -i ''s|YOUR_DOMAIN.com|{0}|g'' {1}/.env 2>/dev/null; true' -f $Domain, $AppDir)
Invoke-Ssh ('sed -i ''s|^ADMIN_API_CORS_ORIGINS=.*|ADMIN_API_CORS_ORIGINS={0}|'' {1}/.env 2>/dev/null; true' -f $corsOrigin, $AppDir)

# nginx + systemd
Invoke-Ssh "sed 's/YOUR_DOMAIN.com/$Domain/g' ${AppDir}/deploy/nginx/videobot.conf > /etc/nginx/sites-available/videobot"
Invoke-Ssh 'ln -sf /etc/nginx/sites-available/videobot /etc/nginx/sites-enabled/videobot; nginx -t; systemctl reload nginx'

Invoke-Ssh 'systemctl restart videobot; systemctl start videobot'
Invoke-Ssh "systemctl status videobot --no-pager"

if (-not $SkipCertbot -and -not $SkipCertbotFlag) {
    $certEmail = Get-DeployVar "CERTBOT_EMAIL" $false
    if (-not $certEmail) { $certEmail = "admin@${Domain}" }
    Write-Host "==> HTTPS (certbot) - DNS A record for $Domain must point to $VpsHost"
    Invoke-Ssh ('certbot --nginx -d {0} --non-interactive --agree-tos -m {1} --redirect; echo certbot-done' -f $Domain, $certEmail)
}

Write-Host ""
Write-Host "Done. Open: https://$Domain" -ForegroundColor Green
Write-Host "If certbot failed, fix DNS A record then run on VPS:"
Write-Host "  certbot --nginx -d $Domain"
