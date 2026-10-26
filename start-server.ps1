$ErrorActionPreference = "Stop"
$phpPath = "php"
$wingetPhp = "C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"

if (-not (Get-Command php -ErrorAction SilentlyContinue) -and (Test-Path $wingetPhp)) {
    $phpPath = $wingetPhp
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " NEXUS ARENA - Game Center Management & Rental System" -ForegroundColor Cyan
Write-Host " Starting Local Web Server at http://localhost:8000" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

& $phpPath -c "$PSScriptRoot\php.ini" -S localhost:8000 "$PSScriptRoot\router.php"
