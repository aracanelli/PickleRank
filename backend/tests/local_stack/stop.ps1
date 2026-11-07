# Stops the local test stack and deletes the throwaway Postgres container (data included).
$Here   = $PSScriptRoot
$RunDir = Join-Path $Here '.run'

foreach ($name in 'uvicorn', 'jwks') {
    $pidFile = Join-Path $RunDir "$name.pid"
    if (Test-Path $pidFile) {
        $procId = [int](Get-Content $pidFile)
        # taskkill /T also ends uvicorn's child processes.
        taskkill /PID $procId /T /F *> $null
        Remove-Item $pidFile
        Write-Host "Stopped $name (pid $procId)"
    }
}

docker rm -f picklerank-testdb *> $null
Write-Host 'Removed container picklerank-testdb'
