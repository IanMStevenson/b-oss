# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#Requires -Version 7.0
<#
.SYNOPSIS
    Spin up a named b-oss dev container on a given branch.

.EXAMPLE
    .\new-container.ps1 -Name auth-refactor -Branch feature/auth-refactor
    .\new-container.ps1 -Name main -Branch main
#>
param(
    [Parameter(Mandatory, HelpMessage='Short identifier for this container, e.g. auth-refactor')]
    [string]$Name,
    [Parameter(Mandatory, HelpMessage='Branch to clone, e.g. feature/auth-refactor or main')]
    [string]$Branch
)

$ErrorActionPreference = 'Stop'

$containerName = "b-oss-$Name"
$volumeName    = "b-oss-code-$Name"
$repo          = 'https://github.com/IanMStevenson/b-oss.git'

# Guard: container already exists
$existing = docker ps -a --filter "name=^${containerName}$" --format '{{.Names}}' 2>$null
if ($existing) {
    Write-Error "Container '$containerName' already exists. Pick a different name or remove it first with remove-container.ps1."
    exit 1
}

Write-Host "Creating container '$containerName' on branch '$Branch'..."

# Create a dedicated code volume for this container
docker volume create $volumeName | Out-Null

# Start the container — sleep infinity keeps it alive for VS Code to attach
docker run -d `
    --name $containerName `
    -v "${volumeName}:/workspaces/b-oss" `
    -v "b-oss-claude-config:/home/node/.claude" `
    -p 5173:5173 `
    -p 3000:3000 `
    -e "CLAUDE_CODE_OAUTH_TOKEN=$env:CLAUDE_CODE_OAUTH_TOKEN" `
    -e "GIT_AUTHOR_NAME=$env:GIT_AUTHOR_NAME" `
    -e "GIT_AUTHOR_EMAIL=$env:GIT_AUTHOR_EMAIL" `
    -e "GIT_COMMITTER_NAME=$env:GIT_AUTHOR_NAME" `
    -e "GIT_COMMITTER_EMAIL=$env:GIT_AUTHOR_EMAIL" `
    -e "ELECTRON_SKIP_BINARY_DOWNLOAD=1" `
    b-oss-devbase:latest `
    sleep infinity | Out-Null

# Clone the repo at the requested branch
Write-Host "Cloning $repo@$Branch..."
docker exec $containerName git clone --branch $Branch $repo /workspaces/b-oss

# Install Linux-specific rolldown binding then run full setup
Write-Host "Running setup (npm install + typecheck + b-view build)..."
docker exec $containerName bash -c "cd /workspaces/b-oss && npm install @rolldown/binding-linux-x64-gnu && npm run setup"

Write-Host ""
Write-Host "Container '$containerName' is ready."
Write-Host ""
Write-Host "To open in VS Code:"
Write-Host "  F1 -> 'Dev Containers: Attach to Running Container' -> $containerName"
Write-Host "  File -> Open Folder -> /workspaces/b-oss"
