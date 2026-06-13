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

# Resolve git identity: env var takes priority, falls back to host git config
$gitName  = if ($env:GIT_AUTHOR_NAME)  { $env:GIT_AUTHOR_NAME }  else { git config --global user.name }
$gitEmail = if ($env:GIT_AUTHOR_EMAIL) { $env:GIT_AUTHOR_EMAIL } else { git config --global user.email }
if (-not $gitName -or -not $gitEmail) {
    Write-Error "Cannot determine git identity. Set GIT_AUTHOR_NAME/GIT_AUTHOR_EMAIL env vars or run: git config --global user.name / user.email"
    exit 1
}

function Invoke-InContainer {
    param([string]$Cmd)
    docker exec $containerName bash -c $Cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Command failed (exit $LASTEXITCODE) in '$containerName': $Cmd"
        exit $LASTEXITCODE
    }
}

# Guard: container already exists
$existing = docker ps -a --filter "name=^${containerName}$" --format '{{.Names}}' 2>$null
if ($existing) {
    Write-Error "Container '$containerName' already exists. Pick a different name or remove it first with remove-container.ps1."
    exit 1
}

Write-Host "Creating container '$containerName' on branch '$Branch'..."

# Create a dedicated code volume for this container
docker volume create $volumeName | Out-Null

# Build docker run args — only include CLAUDE_CODE_OAUTH_TOKEN if set on the host.
# If absent, Claude Code falls through to ~/.claude/.credentials.json (stored login).
$dockerRunArgs = @(
    'run', '-d',
    '--name', $containerName,
    '-v', "${volumeName}:/workspaces/b-oss",
    '-v', 'b-oss-claude-config:/home/node/.claude',
    '-e', "GIT_AUTHOR_NAME=$gitName",
    '-e', "GIT_AUTHOR_EMAIL=$gitEmail",
    '-e', "GIT_COMMITTER_NAME=$gitName",
    '-e', "GIT_COMMITTER_EMAIL=$gitEmail",
    '-e', 'ELECTRON_SKIP_BINARY_DOWNLOAD=1'
)
if ($env:CLAUDE_CODE_OAUTH_TOKEN) {
    $dockerRunArgs += @('-e', "CLAUDE_CODE_OAUTH_TOKEN=$env:CLAUDE_CODE_OAUTH_TOKEN")
}
$dockerRunArgs += @('b-oss-devbase:latest', 'sleep', 'infinity')

# Start the container — sleep infinity keeps it alive for VS Code to attach
& docker @dockerRunArgs | Out-Null

# Clone the repo at the requested branch
Write-Host "Cloning $repo@$Branch..."
docker exec $containerName git clone --branch $Branch $repo /workspaces/b-oss
if ($LASTEXITCODE -ne 0) { Write-Error "git clone failed"; exit $LASTEXITCODE }

# Nuke any devcontainer config from the branch (may be corrupt or a multi-config mess)
# and replace with the clean version from origin/main so VS Code sees a known-good setup.
Write-Host "Replacing .devcontainer/ with clean version from origin/main..."
Invoke-InContainer "cd /workspaces/b-oss && rm -rf .devcontainer/ && git restore --source=origin/main -- .devcontainer/"

# Run full setup (npm install + typecheck + b-view build)
Write-Host "Running setup (npm install + typecheck + b-view build)..."
Invoke-InContainer "cd /workspaces/b-oss && npm run setup"

Write-Host ""
Write-Host "Container '$containerName' is ready."
Write-Host ""
Write-Host "To open in VS Code:"
Write-Host "  F1 -> 'Dev Containers: Attach to Running Container' -> $containerName"
Write-Host "  File -> Open Folder -> /workspaces/b-oss"
