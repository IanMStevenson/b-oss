# b-oss devcontainer workflow

Disposable, named dev containers — one per branch — that share a single Claude Code
configuration volume. Code lives inside each container; everything important gets
committed and pushed before teardown.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- VS Code with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- These environment variables set on your Windows host (add to your profile):

```powershell
$env:CLAUDE_CODE_OAUTH_TOKEN = '<your token>'
$env:GIT_AUTHOR_NAME         = 'Your Name'
$env:GIT_AUTHOR_EMAIL        = 'you@example.com'
```

---

## One-time setup

Do this once. You don't need to repeat it unless you wipe Docker or want to reset the
Claude config from scratch.

### 1 — Build the base image

From the repo root:

```powershell
docker build -t b-oss-devbase:latest -f .devcontainer/Dockerfile.base .devcontainer/
```

The image contains Node 22, git, Claude Code CLI, and a correctly-owned `~/.claude`
directory. It does **not** contain the repo code.

### 2 — Initialise the Claude config volume

```powershell
.\.devcontainer\init-volume.ps1
```

This creates the `b-oss-claude-config` named volume and seeds it with the
container-appropriate Claude settings (full autonomy, but always prompts before
`git push` or `gh` commands). The volume is **shared** across all containers.

---

## Per-branch workflow

### Create a container

```powershell
.\.devcontainer\new-container.ps1 -Name <name> -Branch <branch>
```

Examples:

```powershell
.\.devcontainer\new-container.ps1 -Name main         -Branch main
.\.devcontainer\new-container.ps1 -Name auth-refactor -Branch feature/auth-refactor
```

The script:

1. Creates a code volume `b-oss-code-<name>`
2. Starts a container named `b-oss-<name>` with ports 5173 and 3000 published
3. Clones the repo at the requested branch into the container
4. Runs `npm run setup` (installs deps, typechecks, builds b-view)

The container appears in Docker Desktop by its chosen name.

### Open in VS Code

1. **F1** → `Dev Containers: Attach to Running Container` → select `b-oss-<name>`
2. **File → Open Folder** → `/workspaces/b-oss`

VS Code installs its server in the container on first attach (one-off, ~30 s). On
subsequent attaches it reconnects instantly. The Claude Code extension is installed
automatically.

### Work normally

- `claude` is available in the integrated terminal
- Claude has full autonomy for local operations (file edits, commits, branch ops)
- Claude will always prompt before `git push` or any `gh` command
- Ports 5173 and 3000 are accessible on your host at `localhost:5173` / `localhost:3000`

> **Port conflicts**: if you run two containers simultaneously, only one can publish
> each port. Stop the first container's dev server before starting the second, or edit
> the `-p` flags in `new-container.ps1` to use different host ports.

### Tear down

```powershell
.\.devcontainer\remove-container.ps1 -Name <name>
```

Stops the container and deletes its code volume (`b-oss-code-<name>`). The shared
`b-oss-claude-config` volume is left intact.

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

| File                          | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `Dockerfile.base`             | Defines the `b-oss-devbase:latest` image              |
| `devcontainer.json`           | VS Code devcontainer spec (extensions, ports, mounts) |
| `claude-global-settings.json` | Source for the Claude settings seeded into the volume |
| `init-volume.ps1`             | One-time volume creation and settings seed            |
| `new-container.ps1`           | Create a named container on a branch                  |
| `remove-container.ps1`        | Tear down a container and its code volume             |
