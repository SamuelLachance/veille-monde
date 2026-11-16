@echo off
title Veille Monde
cd /d "%~dp0"

where git >nul 2>nul
if not errorlevel 1 (
  echo Recuperation des mises a jour quotidiennes...
  git pull --ff-only --quiet
  if errorlevel 1 echo Mise a jour impossible pour l'instant : on continue avec la copie locale.
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable sur cet ordinateur.
  echo Ouverture du registre en lecture seule...
  start "" "%~dp0index.html"
  timeout /t 6 >nul
  exit /b 0
)

node outils\generer-bundle.js >nul
echo Demarrage de Veille Monde...
node serveur.js --ouvrir
if errorlevel 1 pause
