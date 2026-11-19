@echo off
REM Abre Sabor y Resena en Windows: inicia el servidor si hace falta y abre
REM el navegador predeterminado. Se puede ejecutar con doble clic.
cd /d "%~dp0"
node scripts\abrir.js
if errorlevel 1 pause
