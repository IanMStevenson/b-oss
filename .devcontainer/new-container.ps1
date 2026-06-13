# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#Requires -Version 7.0
<#
.SYNOPSIS
    Spin up a named b-oss dev container on a given branch.

.DESCRIPTION
    Clones the repo into a host directory and bind-mounts it into the container,
    so Chrome can load extension builds and executables are accessible on Windows.
    The same directory can be opened locally in VS Code for full-speed native dev.

.EXAMPLE
    .\new-container.ps1 -Name b-ark-chrome -Branch b-ark-chrome
    .\new-container.ps1 -Name main -Branch main -Root D:\dev
#>
param(
    [Parameter(Mandatory, HelpMessage='Short identifier, e.g. b-ark-chrome')]
    [string]$Name,
    [Parameter(Mandatory, HelpMessage='Branch to clone, e.g. b-ark-chrome or main')]
    [string]$Branch,
    [Parameter(HelpMessage='Parent directory for workspaces. Default: $HOME\devcontainers')]
    [string]$Root = (Join-Path $HOME 'devcontainers')
)

$ErrorActionPreference = 'Stop'

$containerName = "b-oss-$Name"
$workspace     = Join-Path $Root $Name
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

# Guards
$existing = docker ps -a --filter "name=^${containerName}$" --format '{{.Names}}' 2>$null
if ($existing) {
    Write-Error "Container '$containerName' already exists. Remove it first with remove-container.ps1."
    exit 1
}
if (Test-Path $workspace) {
    Write-Error "Workspace already exists: $workspace. Remove it or pick a different name."
    exit 1
}

Write-Host "Creating container '$containerName' on branch '$Branch'..."
Write-Host "Workspace: $workspace"

# Clone on the host so Windows can also open the folder directly
Write-Host "Cloning $repo@$Branch..."
git clone --branch $Branch $repo $workspace
if ($LASTEXITCODE -ne 0) { Write-Error "git clone failed"; exit $LASTEXITCODE }

# Replace any devcontainer config from the branch with the clean version from main
Write-Host "Replacing .devcontainer/ with clean version from origin/main..."
git -C $workspace restore --source=origin/main -- .devcontainer/
if ($LASTEXITCODE -ne 0) { Write-Error "devcontainer restore failed"; exit $LASTEXITCODE }

# Build docker run args — only pass CLAUDE_CODE_OAUTH_TOKEN if set on the host;
# if absent, Claude Code falls through to ~/.claude/.credentials.json (stored login)
$dockerRunArgs = @(
    'run', '-d',
    '--name', $containerName,
    '-v', "${workspace}:/workspaces/b-oss",
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

& docker @dockerRunArgs | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "docker run failed"; exit $LASTEXITCODE }

# Run setup (npm install + typecheck + b-view build)
Write-Host "Running setup (npm install + typecheck + b-view build)..."
Invoke-InContainer "cd /workspaces/b-oss && npm run setup"

Write-Host ""
Write-Host "Container '$containerName' is ready."
Write-Host ""
Write-Host "Open in VS Code (containerised, Claude free to work):"
Write-Host "  F1 -> 'Dev Containers: Attach to Running Container' -> $containerName"
Write-Host "  File -> Open Folder -> /workspaces/b-oss"
Write-Host ""
Write-Host "Open locally (full Windows performance, direct Chrome/exe access):"
Write-Host "  code '$workspace'"
