<#
.SYNOPSIS
  Start/stop/status the local Django backend (port 8000) and Vite frontend
  (port 5173) dev servers, using the repo's .venv for Python.

.USAGE
  scripts\dev-server.ps1 start    # start both if not already running
  scripts\dev-server.ps1 stop     # stop both, if running
  scripts\dev-server.ps1 status   # report what's running
  scripts\dev-server.ps1 restart

  PID files + logs live in .dev-server\ (gitignored).
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'restart')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$StateDir = Join-Path $RepoRoot '.dev-server'
$BackendPidFile = Join-Path $StateDir 'backend.pid'
$FrontendPidFile = Join-Path $StateDir 'frontend.pid'
$BackendLog = Join-Path $StateDir 'backend.log'
$FrontendLog = Join-Path $StateDir 'frontend.log'
$BackendPort = 8000
$FrontendPort = 5173

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir | Out-Null
}

$VenvPy = Join-Path $RepoRoot '.venv\Scripts\python.exe'

function Test-ProcRunning([string]$PidFile) {
    if (-not (Test-Path $PidFile)) { return $false }
    $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $procId) { return $false }
    return $null -ne (Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Show-Status {
    if (Test-ProcRunning $BackendPidFile) {
        $procId = Get-Content $BackendPidFile
        Write-Host "backend: running (pid $procId, port $BackendPort, log $BackendLog)"
    } else {
        Write-Host "backend: stopped"
    }
    if (Test-ProcRunning $FrontendPidFile) {
        $procId = Get-Content $FrontendPidFile
        Write-Host "frontend: running (pid $procId, port $FrontendPort, log $FrontendLog)"
    } else {
        Write-Host "frontend: stopped"
    }
}

function Start-Servers {
    if (Test-ProcRunning $BackendPidFile) {
        Write-Host "backend already running (pid $(Get-Content $BackendPidFile))"
    } else {
        if (-not (Test-Path $VenvPy)) {
            Write-Error "venv python not found at $VenvPy - create it first (python -m venv .venv)"
            exit 1
        }
        Write-Host "starting backend (django) on :$BackendPort ..."
        $proc = Start-Process -FilePath $VenvPy `
            -ArgumentList @('manage.py', 'runserver', $BackendPort) `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $BackendLog `
            -RedirectStandardError "${BackendLog}.err" `
            -WindowStyle Hidden `
            -PassThru
        $proc.Id | Out-File -FilePath $BackendPidFile -Encoding ascii
        Start-Sleep -Seconds 1
        Write-Host "backend pid $($proc.Id), log: $BackendLog"
    }

    if (Test-ProcRunning $FrontendPidFile) {
        Write-Host "frontend already running (pid $(Get-Content $FrontendPidFile))"
    } else {
        Write-Host "starting frontend (vite) on :$FrontendPort ..."
        $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
        if (-not $npmCmd) { $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue) }
        if (-not $npmCmd) {
            Write-Error "npm not found on PATH"
            exit 1
        }
        $proc = Start-Process -FilePath $npmCmd.Source `
            -ArgumentList @('run', 'dev', '--', '--port', $FrontendPort) `
            -WorkingDirectory (Join-Path $RepoRoot 'frontend') `
            -RedirectStandardOutput $FrontendLog `
            -RedirectStandardError "${FrontendLog}.err" `
            -WindowStyle Hidden `
            -PassThru
        $proc.Id | Out-File -FilePath $FrontendPidFile -Encoding ascii
        Start-Sleep -Seconds 1
        Write-Host "frontend pid $($proc.Id), log: $FrontendLog"
    }
}

function Stop-Servers {
    foreach ($item in @(
        @{ Name = 'backend'; PidFile = $BackendPidFile },
        @{ Name = 'frontend'; PidFile = $FrontendPidFile }
    )) {
        $name = $item.Name
        $pidFile = $item.PidFile
        if (Test-ProcRunning $pidFile) {
            $procId = Get-Content $pidFile
            Write-Host "stopping $name (pid $procId) ..."
            # /T kills the whole child tree (npm -> vite, python -> reloader child), /F forces it.
            & taskkill /PID $procId /T /F 2>$null | Out-Null
            Remove-Item $pidFile -ErrorAction SilentlyContinue
        } else {
            Write-Host "$name not running"
            Remove-Item $pidFile -ErrorAction SilentlyContinue
        }
    }
}

switch ($Action) {
    'start'   { Start-Servers }
    'stop'    { Stop-Servers }
    'status'  { Show-Status }
    'restart' { Stop-Servers; Start-Servers }
}
