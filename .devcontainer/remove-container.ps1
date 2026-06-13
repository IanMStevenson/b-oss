# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#Requires -Version 7.0
<#
.SYNOPSIS
    Stop and delete a b-oss dev container and its code volume.

.DESCRIPTION
    Removes the container and its per-container code volume (b-oss-code-<name>).
    The shared b-oss-claude-config volume is left intact.

.EXAMPLE
    .\remove-container.ps1 -Name auth-refactor
#>
param(
    [Parameter(Mandatory, HelpMessage='The name you used when creating the container')]
    [string]$Name
)

$ErrorActionPreference = 'Stop'

$containerName = "b-oss-$Name"
$volumeName    = "b-oss-code-$Name"

Write-Host "Stopping '$containerName'..."
docker stop $containerName 2>$null | Out-Null

Write-Host "Removing container '$containerName'..."
docker rm $containerName 2>$null | Out-Null

Write-Host "Removing code volume '$volumeName'..."
docker volume rm $volumeName 2>$null | Out-Null

Write-Host "Done. The shared 'b-oss-claude-config' volume was left intact."
