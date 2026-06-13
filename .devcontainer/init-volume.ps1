# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#Requires -Version 7.0
<#
.SYNOPSIS
    One-time setup: creates the b-oss-claude-config Docker volume and seeds it with
    the container-appropriate Claude Code settings.

.DESCRIPTION
    Run this once before your first container. The volume persists across all
    containers and stores Claude's auth, session data, and global settings.
    Re-run only if you need to reset the Claude config from scratch.
#>

$ErrorActionPreference = 'Stop'

$volumeName   = 'b-oss-claude-config'
$settingsPath = Join-Path $PSScriptRoot 'claude-global-settings.json'

# Check for base image
$imageExists = docker image inspect b-oss-devbase:latest 2>$null
if (-not $imageExists) {
    Write-Error "Base image b-oss-devbase:latest not found. Build it first:`n  docker build -t b-oss-devbase:latest -f .devcontainer/Dockerfile.base .devcontainer/"
    exit 1
}

# Create volume (safe to run if it already exists)
docker volume create $volumeName | Out-Null
Write-Host "Volume '$volumeName' ready."

# Seed settings.json — bind-mount the file into alpine to avoid shell quoting issues,
# then fix ownership (node user is uid 1000 in the b-oss-devbase image)
docker run --rm `
    -v "${volumeName}:/home/node/.claude" `
    -v "${settingsPath}:/tmp/settings.json:ro" `
    alpine `
    sh -c "chown 1000:1000 /home/node/.claude && cp /tmp/settings.json /home/node/.claude/settings.json && chown 1000:1000 /home/node/.claude/settings.json"

Write-Host "Claude settings written to volume."
Write-Host ""
Write-Host "Done. You can now run new-container.ps1 to create your first container."
