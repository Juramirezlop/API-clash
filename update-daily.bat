@echo off
cd "C:\Users\WIN11\Documents\Estudio Propio\COC\clash-dashboard"
echo %date% %time% - Iniciando actualización >> logs.txt
node update-data.js >> logs.txt 2>&1
echo %date% %time% - Actualización completada >> logs.txt
pause