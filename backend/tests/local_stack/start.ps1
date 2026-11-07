# Local, production-isolated PickleRank test stack (Windows PowerShell 5.1+).
# Starts: Postgres 16 (docker, host port 54329) + local JWKS (8765) + uvicorn backend (8000).
# Never point this at Supabase: the DB host guard below aborts on 'supabase' / 'pooler'.
# 'Continue' on purpose: in PS 5.1, 'Stop' turns any native stderr line (docker) into a terminating error.
# Failures are checked explicitly via $LASTEXITCODE / throw.
$ErrorActionPreference = 'Continue'

$Here       = $PSScriptRoot
$BackendDir = (Resolve-Path (Join-Path $Here '..\..')).Path
$Python     = Join-Path $BackendDir '.venv\Scripts\python.exe'
$RunDir     = Join-Path $Here '.run'
$Container  = 'picklerank-testdb'
$DbPort     = 54329
$DbPassword = 'picklerank-local-only'   # local throwaway container only

New-Item -ItemType Directory -Force $RunDir | Out-Null
if (-not (Test-Path $Python)) { throw "Python venv not found at $Python" }

function Test-Port([int]$Port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $c.Close() }
}

function Wait-Until([scriptblock]$Check, [string]$What, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Check) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "Timed out waiting for $What"
}

# ---------- 1. Postgres ----------
docker inspect $Container *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating container $Container (postgres:16) on port $DbPort..."
    docker run -d --name $Container -e "POSTGRES_PASSWORD=$DbPassword" -p "127.0.0.1:${DbPort}:5432" postgres:16 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker run failed' }
} else {
    docker start $Container | Out-Null
}
# TCP check inside the container: the initdb bootstrap server only listens on the unix socket.
Wait-Until { docker exec $Container pg_isready -h 127.0.0.1 -U postgres *> $null; $LASTEXITCODE -eq 0 } 'postgres' 90

$hasSchema = (docker exec $Container psql -U postgres -tAc "select to_regclass('public.users') is not null").Trim()
if ($hasSchema -ne 't') {
    Write-Host 'Loading schema.sql...'
    Get-Content (Join-Path $Here 'schema.sql') -Raw | docker exec -i $Container psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres
    if ($LASTEXITCODE -ne 0) { throw 'schema.sql failed to load' }
} else {
    Write-Host 'Schema already present (run stop.ps1 for a clean database).'
}

# ---------- 2. JWKS ----------
& $Python (Join-Path $Here 'jwks_server.py') --init
if (-not (Test-Port 8765)) {
    $p = Start-Process -FilePath $Python -ArgumentList "`"$(Join-Path $Here 'jwks_server.py')`"" `
        -WorkingDirectory $Here -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $RunDir 'jwks.out.log') -RedirectStandardError (Join-Path $RunDir 'jwks.err.log')
    Set-Content -Path (Join-Path $RunDir 'jwks.pid') -Value $p.Id
    Wait-Until { Test-Port 8765 } 'JWKS server' 20
}

# ---------- 3. Backend env (process-scoped; backend/ has no .env) ----------
$env:SUPABASE_DB_URL = "postgresql://postgres:${DbPassword}@localhost:${DbPort}/postgres"
$env:CLERK_JWKS_URL  = 'http://localhost:8765/jwks.json'
$env:CLERK_ISSUER    = 'http://localhost:8765'
$env:CLERK_AUDIENCE  = 'picklerank-local'
$env:ALLOWED_ORIGINS = 'http://localhost:5199,http://localhost:5173'
$env:SECRET_KEY      = 'local-test-stack-only'
$env:ENVIRONMENT     = 'development'
$env:DEBUG           = 'false'
$env:VERCEL          = $null

if (Test-Path (Join-Path $BackendDir '.env')) { throw "backend\.env exists - refusing to start (it could override settings)." }

$dbHost = ([Uri]$env:SUPABASE_DB_URL).Host
Write-Host "Effective DB host: $dbHost (port $(([Uri]$env:SUPABASE_DB_URL).Port))"
if ($env:SUPABASE_DB_URL -match 'supabase|pooler' -or $dbHost -match 'supabase|pooler') {
    throw "ABORT: DB host '$dbHost' looks like production Supabase."
}
if (@('localhost', '127.0.0.1') -notcontains $dbHost) { throw "ABORT: DB host '$dbHost' is not local." }

# ---------- 4. uvicorn ----------
if (Test-Port 8000) { throw 'Port 8000 already in use - run stop.ps1 first.' }
$api = Start-Process -FilePath $Python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' `
    -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $RunDir 'uvicorn.out.log') -RedirectStandardError (Join-Path $RunDir 'uvicorn.err.log')
Set-Content -Path (Join-Path $RunDir 'uvicorn.pid') -Value $api.Id
Wait-Until { try { (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/api/health' -TimeoutSec 2).StatusCode -eq 200 } catch { $false } } 'uvicorn' 60

Write-Host ''
Write-Host 'Stack up:'
Write-Host "  Postgres  localhost:$DbPort  (container $Container)"
Write-Host '  JWKS      http://localhost:8765/jwks.json'
Write-Host '  API       http://localhost:8000/api   (docs: /docs)'
Write-Host "  Logs      $RunDir\uvicorn.err.log"
