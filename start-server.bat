@echo off
SETLOCAL
SET "PHP_EXE=php"
IF EXIST "%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe" (
    SET "PHP_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"
)
echo ================================================================
echo  NEXUS ARENA - Game Center Management ^& Rental System
echo  URL: http://localhost:8000
echo ================================================================
"%PHP_EXE%" -c "%~dp0php.ini" -S localhost:8000 "%~dp0router.php"
