@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" "%CD%\node_modules\next\dist\bin\next" dev -p 3000
