param(
  [ValidateSet('Start', 'Stop', 'Status', 'Run', 'Restart')][string]$Action = 'Status',
  [ValidateSet('api', 'web', 'worker', 'mobile')][string]$App = 'api',
  [ValidateSet('api', 'web', 'worker', 'mobile')][string[]]$Applications = @('api', 'worker', 'web', 'mobile'),
  [switch]$SkipBuild,
  [switch]$DependenciesReady,
  # Stable: run the API without file watching so builds and tests do not restart it
  # (the phone keeps its connection); restart it explicitly with -Action Restart.
  [switch]$Stable
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
Set-Location $repository
$stateDirectory = Join-Path $repository '.tools\local-dev'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
if (!$dockerCommand) {
  $dockerPath = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
  $env:PATH = "$dockerPath;$env:PATH"
}

function Invoke-Pnpm {
  & corepack.cmd pnpm @args
  if ($LASTEXITCODE -ne 0) { throw 'pnpm task failed; inspect its output.' }
}

function Invoke-Compose {
  & docker.exe compose --env-file .env -f infra/docker-compose.yml @args
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed; inspect its output.' }
}

function Test-DockerReady {
  try {
    & docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-AppProcess([string]$Name) {
  $stateFile = Join-Path $stateDirectory "$Name.json"
  if (!(Test-Path $stateFile)) { return $null }
  $state = Get-Content $stateFile -Raw | ConvertFrom-Json
  $process = Get-Process -Id $state.Id -ErrorAction SilentlyContinue
  if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.StartTimeTicks) {
    return $process
  }
  return $null
}

if ($Action -eq 'Run') {
  if ($App -eq 'web') { $env:PORT = '3000' }
  if ($App -eq 'mobile') {
    Remove-Item Env:CI -ErrorAction SilentlyContinue
    if (Test-Path (Join-Path $repository '.tools\android\sdk\cmdline-tools\19.0\bin\sdkmanager.bat')) {
      . (Join-Path $PSScriptRoot 'android-env.ps1')
    }
  }
  $task = if ($Stable -and $App -eq 'api') { 'start' } else { 'dev' }
  $devArguments = @('turbo', 'run', $task, "--filter=@hsm/$App", '--concurrency=2')
  if ($DependenciesReady) { $devArguments += '--only' }
  Invoke-Pnpm @devArguments
  exit
}

if ($Action -eq 'Start') {
  if (!(Test-DockerReady)) {
    $desktopPath = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
    if (!(Test-Path $desktopPath)) {
      $desktopPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    }
    if (!(Test-Path $desktopPath)) { throw 'Install or start Docker Desktop with Linux containers.' }
    Start-Process $desktopPath -WindowStyle Hidden
    $deadline = (Get-Date).AddMinutes(2)
    do {
      Start-Sleep -Seconds 2
      if (Test-DockerReady) { break }
    } while ((Get-Date) -lt $deadline)
    if (!(Test-DockerReady)) { throw 'Open Docker Desktop and wait for Engine running, then retry.' }
  }
  Invoke-Compose config --quiet
  Invoke-Compose up -d
  Invoke-Compose up --wait --wait-timeout 300 postgres redis clamav mailpit storage
  Invoke-Compose wait storage-init
  if (!$SkipBuild) {
    # Build shared client generation once, before independent web/mobile supervisors.
    Invoke-Pnpm turbo run build --filter=@hsm/api --filter=@hsm/worker --filter=@hsm/api-client --filter=@hsm/ui --concurrency=2
  }
  & node infra/local-env.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Environment validation failed.' }
  & node infra/local-database.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Database preflight failed; no migrations applied.' }
  Invoke-Pnpm turbo run db:migrate --filter=@hsm/db
  foreach ($name in $Applications) {
    if (Get-AppProcess $name) { continue }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      ('"' + $PSCommandPath + '"'), '-Action', 'Run', '-App', $name, '-DependenciesReady')
    if ($Stable) { $arguments += '-Stable' }
    $process = Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $repository `
      -WindowStyle Hidden -PassThru -RedirectStandardOutput "$stateDirectory\$name.log" `
      -RedirectStandardError "$stateDirectory\$name.error.log"
    @{ Id = $process.Id; StartTimeTicks = $process.StartTime.ToUniversalTime().Ticks.ToString() } |
      ConvertTo-Json | Set-Content "$stateDirectory\$name.json"
  }
  Write-Output 'Applications launched. Check Status, readiness URLs and .tools/local-dev logs.'
}

if ($Action -eq 'Stop') {
  foreach ($name in @('api', 'worker', 'web', 'mobile')) {
    $process = Get-AppProcess $name
    if ($process) {
      & taskkill.exe /PID $process.Id /T /F | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Unable to stop $name" }
    }
  }
  Invoke-Compose stop
  Write-Output 'HSM processes and containers stopped; volumes preserved.'
}

if ($Action -eq 'Restart') {
  # Restart only the named applications (default: api) after a backend change.
  foreach ($name in $Applications) {
    $process = Get-AppProcess $name
    if ($process) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      ('"' + $PSCommandPath + '"'), '-Action', 'Run', '-App', $name, '-DependenciesReady')
    if ($Stable) { $arguments += '-Stable' }
    $started = Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $repository `
      -WindowStyle Hidden -PassThru -RedirectStandardOutput "$stateDirectory\$name.log" `
      -RedirectStandardError "$stateDirectory\$name.error.log"
    @{ Id = $started.Id; StartTimeTicks = $started.StartTime.ToUniversalTime().Ticks.ToString() } |
      ConvertTo-Json | Set-Content "$stateDirectory\$name.json"
  }
  Write-Output 'Restarted.'
}

if ($Action -eq 'Status') {
  Invoke-Compose ps --all
  foreach ($name in @('api', 'worker', 'web', 'mobile')) {
    $process = Get-AppProcess $name
    Write-Output "$name supervisor running: $([bool]$process)"
  }
}
