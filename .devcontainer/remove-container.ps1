# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#Requires -Version 7.0
<#
.SYNOPSIS
    Stop and remove a b-oss dev container.

.DESCRIPTION
    Removes the container only. The workspace directory on the host is left intact
    so you can still open it locally, browse history, or recover work.
    Delete it manually when you are done with it.

.EXAMPLE
    .\remove-container.ps1 -Name b-ark-chrome
    .\remove-container.ps1 -Name b-ark-chrome -Root D:\dev
#>
param(
    [Parameter(Mandatory, HelpMessage='The name you used when creating the container')]
    [string]$Name,
    [Parameter(HelpMessage='Parent directory for workspaces. Default: $HOME\devcontainers')]
    [string]$Root = (Join-Path $HOME 'devcontainers')
)

$ErrorActionPreference = 'Stop'

$containerName = "b-oss-$Name"
$workspace     = Join-Path $Root $Name

Write-Host "Stopping '$containerName'..."
docker stop $containerName 2>$null | Out-Null

Write-Host "Removing container '$containerName'..."
docker rm $containerName 2>$null | Out-Null

Write-Host "Done. The shared 'b-oss-claude-config' volume was left intact."

if (Test-Path $workspace) {
    Write-Host ""
    Write-Host "Workspace left intact: $workspace"
    Write-Host "Delete it when you no longer need it:"
    Write-Host "  Remove-Item -Recurse -Force '$workspace'"
}
