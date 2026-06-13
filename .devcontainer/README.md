# b-oss devcontainer workflow

Disposable, named dev containers — one per branch — sharing a single Claude Code
configuration volume. Each container bind-mounts its source tree from a host directory,
so Chrome can load extension builds and executables are accessible on Windows without
copying files out of the container.

The same directory can also be opened locally in VS Code for full-speed native development.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running, WSL2 backend)
- VS Code with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- These environment variables set on your Windows host (add to your profile):

```powershell
$env:GIT_AUTHOR_NAME  = 'Your Name'
$env:GIT_AUTHOR_EMAIL = 'you@example.com'
```

`CLAUDE_CODE_OAUTH_TOKEN` is optional — if absent, Claude Code falls through to the
stored credentials in the `b-oss-claude-config` volume.

---

## One-time setup

Do this once. You don't need to repeat it unless you wipe Docker or want to reset the
Claude config from scratch.

### 1 — Build the base image

From the repo root:

```powershell
docker build -t b-oss-devbase:latest -f .devcontainer/Dockerfile.base .devcontainer/
```

The image contains Node 22, git, Claude Code CLI, and the Claude Code VS Code extension
pre-installed. It does **not** contain the repo code.

### 2 — Initialise the Claude config volume

```powershell
.\.devcontainer\init-volume.ps1
```

Creates the `b-oss-claude-config` named volume and seeds it with the container-appropriate
Claude settings (full autonomy, but always prompts before `git push` or `gh` commands).
This volume is **shared** across all containers and holds your Claude auth credentials.

---

## Per-branch workflow

### Create a container

```powershell
.\.devcontainer\new-container.ps1 -Name <name> -Branch <branch>
```

Examples:

```powershell
.\.devcontainer\new-container.ps1 -Name main        -Branch main
.\.devcontainer\new-container.ps1 -Name b-ark-chrome -Branch b-ark-chrome
```

By default, the workspace is created at `$HOME\devcontainers\<name>`. Override with
`-Root D:\dev` to place it elsewhere.

The script:

1. Clones the repo at the requested branch into `<Root>\<name>` on the host
2. Replaces `.devcontainer/` with the clean version from `origin/main`
3. Starts a container named `b-oss-<name>` with the host directory bind-mounted
4. Runs `npm run setup` (installs deps, typechecks, builds b-view)

The container appears in Docker Desktop by its chosen name.

### Open in VS Code (containerised)

1. **F1** → `Dev Containers: Attach to Running Container` → select `b-oss-<name>`
2. **File → Open Folder** → `/workspaces/b-oss`

VS Code installs its server in the container on first attach (one-off, ~30 s). The Claude
Code extension is installed automatically from the pre-baked image.

### Open locally (Windows, full native speed)

```powershell
code "$HOME\devcontainers\<name>"
```

The source tree is on the Windows filesystem, so Chrome can load an unpacked extension
directly from `<workspace>\packages\b-ark-chrome\dist\` and any built executables
run natively.

### Work normally

- `claude` is available in the integrated terminal (containerised) or host terminal (local)
- Claude has full autonomy for local operations (file edits, commits, branch ops)
- Claude will always prompt before `git push` or any `gh` command
- Built outputs (dist/, executables) are immediately accessible from Windows without copying

### Tear down

```powershell
.\.devcontainer\remove-container.ps1 -Name <name>
```

Stops and removes the container. The workspace directory on the host is left intact —
delete it manually when you no longer need it:

```powershell
Remove-Item -Recurse -Force "$HOME\devcontainers\<name>"
```

---

## Rebuilding the base image

Rebuild when Node or Claude Code needs upgrading, or after major dependency changes:

```powershell
docker build -t b-oss-devbase:latest -f .devcontainer/Dockerfile.base .devcontainer/
```

Existing running containers are unaffected. New containers created after the rebuild
will use the new image.

---

## File reference

| File                          | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `Dockerfile.base`             | Defines the `b-oss-devbase:latest` image                  |
| `devcontainer.json`           | VS Code devcontainer spec (extensions, mounts, env)       |
| `claude-global-settings.json` | Source for the Claude settings seeded into the volume     |
| `init-volume.ps1`             | One-time volume creation and settings seed                |
| `new-container.ps1`           | Clone repo to host + start named container                |
| `remove-container.ps1`        | Stop and remove a container (workspace preserved on host) |
