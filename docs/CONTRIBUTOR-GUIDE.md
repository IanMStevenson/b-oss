# b-oss contributor guide

How to explore, build, run, test and contribute to b-oss. It is written for two readers:

- **Someone who just wants their own version running or a change upstream**, with nothing but a PC and
  an AI coding agent such as [Claude Code](https://claude.com/claude-code). You do not need to be a
  developer. Most of b-oss was written with Claude Code, so this guide uses it in its examples, but
  nothing here depends on it: another agent (Codex, Copilot, Cursor, Gemini CLI and so on) works, and so
  does writing the code by hand in any editor. Where the guide says "ask Claude Code", read "ask your
  tool, or do it yourself". Start at [Part 1](#part-1-the-basic-setup).
- **A seasoned developer** who wants to know how this project is set up and run. Skip to
  [Part 5](#part-5-how-this-project-is-run) and [Part 6](#part-6-contributing).

Short pointers live in [CONTRIBUTING.md](../CONTRIBUTING.md); package design is in
[ARCHITECTURE.md](../ARCHITECTURE.md); the rules an agent must follow are in [CLAUDE.md](../CLAUDE.md).

## Part 1: The basic setup

You need three things: Git, Node.js, and Claude Code. Everything else is optional.

1. **Git** — [git-scm.com/downloads](https://git-scm.com/downloads).
2. **Node.js 20** (see `.nvmrc`) — [nodejs.org](https://nodejs.org/), or `nvm` ([nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows).
3. **An agent** (optional but recommended) — this guide uses **Claude Code**: [install instructions](https://docs.claude.com/en/docs/claude-code/setup). It needs a Claude subscription or API key.
4. **A GitHub account**, if you want to contribute. Fork the repo first (button at the top right of the repository page).

Then, in a terminal:

```bash
git clone https://github.com/<your-username>/b-oss.git
cd b-oss
nvm use          # picks Node 20; skip if you installed Node 20 directly
npm run setup    # installs dependencies, creates .env.local, typechecks, builds the viewer
claude           # start Claude Code in the repo (or open the repo in your editor or other tool)
```

Claude Code reads `CLAUDE.md` automatically, so it already knows the layout and the rules (other tools can be pointed at it; many read `AGENTS.md`, and it's fine to paste `CLAUDE.md` in). Good first prompts:

- "Give me a tour of this repo and what each package does."
- "Build and run b-ark in development mode and tell me what I should see."
- "Run the tests and explain anything that fails."

Read [Keep the agent safe](#keep-the-agent-safe-and-keep-yourself-safe) below before you start giving it commands to run.

### What you can do without any Blipfoto credentials

Typechecking, linting and the test suite (`npm run typecheck`, `npm run lint`, `npm test`) need no
credentials. Running an app that signs in to Blipfoto does: register your own app at
<https://www.blipfoto.com/developer/apps> (type **distributed app**, no client secret) and put its client
ID in `.env.local`. `.env.example` lists which key and redirect URI each app wants, and which keys are
optional. Use your own registration for testing; never commit `.env.local`.

### Windows notes

b-oss is developed mostly on Linux and the Windows desktop app is built from Linux. The commands above are
plain npm and should work in a normal Windows terminal, but if something odd happens in the setup step,
[WSL](#part-2-more-advanced-setups) is the smoother path, and Claude Code will help you either way. Tell it
exactly what failed.

### Keep the agent safe (and keep yourself safe)

An agent that can run commands can also delete files, install software and read anything your account
can read. Pick one of these before you let it loose:

- **Careful permissions.** Leave the agent in its default mode, where it asks before running commands or
  editing files, and read what it asks. This is slower, and it only protects you if you actually read
  the prompts.
- **An isolated environment.** Run it on a machine or VM that holds nothing you would mind losing: no
  personal files, no password manager, no saved browser sign-ins, no credentials beyond the ones this
  project needs. Then you can let it work without asking each time.

The maintainer uses the second approach: a separate, isolated Linux machine, reached over the network,
with nothing personal on it and nothing it can harm. That is what allows Claude Code to run freely there
in its "YOLO" mode (permission prompts off). Do not turn that mode on for the PC you also use for banking
and email.

Either way: never paste real tokens or passwords into a prompt, never commit `.env.local`, and read a
diff before it goes into a pull request.

## Part 1b: Running what you build

Builds run on your own devices. Each app has its own route; all of them need your own Blipfoto app
registration in `.env.local` (see above) to sign in.

| App                                          | How to run your build                 | Command / notes                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **b-ark** (desktop)                          | In development, or as a Windows build | `npm run dev --workspace=packages/b-ark` for development. For an installer: `npm run dist:win --workspace=packages/b-ark` on Windows (the exe is written to `packages/b-ark/dist-electron/`). From Linux, `./scripts/build-win-docker.sh` builds it in Docker with no Wine on the host; see [RELEASING.md](../RELEASING.md) section 3. |
| **b-mobile-pc** (desktop shell for b-mobile) | Same idea                             | `npm run dist:win --workspace=packages/b-mobile-pc` on Windows, after building b-mobile (`npm run build -w @b-oss/b-mobile`); from Linux, `packages/b-mobile-pc/scripts/build-win-docker.sh`. Details: [its README](../packages/b-mobile-pc/README.md).                                                                                |
| **b-ark-chrome** (extension)                 | Load unpacked                         | `npm run build --workspace=@b-oss/b-ark-chrome`, then in Chrome or Edge open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked**, and pick `packages/b-ark-chrome/dist`. After a rebuild press the reload button on the extension.                                                                           |
| **b-mobile** (Android)                       | Install over adb                      | Needs the Android SDK, a debug build and a phone with USB or wireless debugging on. See below.                                                                                                                                                                                                                                         |

**Unlocking the device.** Your own builds are not signed by a trusted publisher, and the devices know it:

- **Windows.** Windows SmartScreen warns about an unrecognised app: choose **More info**, then **Run
  anyway**. If Smart App Control or an organisation policy blocks it outright, you'll need to turn that
  off in Windows Security (**App & browser control**); this lowers protection for every app, so prefer a
  machine or VM you are happy to do that on.
- **Chrome.** Loading unpacked needs **Developer mode** on the extensions page. Chrome may remind you at
  each start that you're running developer-mode extensions.
- **Android.** Turn on **Developer options** (Settings, About phone, tap **Build number** seven times),
  then **USB debugging** (or **Wireless debugging**). Your phone asks you to approve the computer the
  first time. The Android Developer docs cover [adb](https://developer.android.com/tools/adb) pairing.

**b-mobile on a phone, in outline.** The debug build installs beside the Play Store app with its own
data, so it can't clobber the real one. It reads its own Blipfoto client ID from
`.env.android-debug.local` (see `.env.example`).

```bash
npm run build:android-debug -w @b-oss/b-mobile
cd packages/b-mobile && npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Push notifications also need a Firebase `google-services.json`; without it the build still works, just
silently without push. Ask your agent to walk you through this the first time, and see `CLAUDE.md` for
the Gradle and proxy details.

## Part 2: More advanced setups

Move up only when the basic setup is getting in your way.

| Setup                      | Why you'd choose it                                                                | Notes                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **WSL 2** (Windows)        | Linux tooling on a Windows PC; closest to how the project is built and tested      | Keep the repo **inside** the WSL filesystem (`~/dev`), not under `/mnt/c`; it is far faster. Install Node, Git and Claude Code inside WSL. |
| **A virtual machine**      | Keeps experiments, credentials and a big `node_modules` away from your everyday PC | Any Linux VM works; 8 GB RAM is comfortable for one builder, and more if you run several agents.                                           |
| **A cloud box**            | Sessions that keep running when your PC is off                                     | Same as a VM, rented. Keep secrets out of it that you would not put on a shared machine.                                                   |
| **Claude Code on the web** | Start work from a browser or phone without any local setup                         | Works on a GitHub repo you have access to; you will still want a local clone to run the apps.                                              |
| **HAPI**                   | Driving several Claude Code sessions at once from a phone or browser               | Optional. It is what the maintainer uses to watch and steer parallel sessions; see [hapi.run](https://hapi.run).                           |

Two practical limits to know about:

- **Memory.** A browser, a dev server and an agent each want a few hundred MB or more. Several at once
  adds up quickly; close what you are not using.
- **Platform-specific builds.** The Windows installer is built on Linux in Docker
  (`scripts/build-win-docker.sh`), the Mac build needs a Mac runner, and the Android app needs the
  Android SDK. None of these is needed to work on the shared packages.

## Part 3: The tools, and what each is for

| Tool                                 | What it is for here                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Node 20 + npm**                    | Runs everything. The repo is an npm-workspaces monorepo under `packages/`.                                                            |
| **TypeScript** (`npm run typecheck`) | Strict mode, no `any`. Run after every change.                                                                                        |
| **ESLint** (`npm run lint`)          | Zero warnings allowed. It also enforces the package boundaries (for example, only `b-mobile`'s `src/platform/` may import Capacitor). |
| **Vitest** (`npm test`)              | Unit tests across the packages. `npm run test:watch` while you work.                                                                  |
| **Prettier** (`npm run format`)      | Formatting. A pre-commit hook (husky + lint-staged) runs on staged files.                                                             |
| **Vite / electron-vite**             | Dev servers and builds. `npm run dev --workspace=packages/b-ark` starts b-ark; each app package has its own `dev`.                    |
| **Electron**                         | The desktop apps (`b-ark`, `b-mobile-pc`).                                                                                            |
| **Chrome** (load unpacked)           | Test `b-ark-chrome`: build it, then load its `dist/` from `chrome://extensions`.                                                      |
| **Capacitor + Android SDK**          | `b-mobile` on a phone or emulator. Only needed for `b-mobile` native work.                                                            |
| **Playwright**                       | Drives a real browser to screenshot or test web UI. Ask Claude Code to use it for any visual change.                                  |
| **Docker**                           | Windows builds from Linux, and the `b-mobile-pc` end-to-end suite. Optional.                                                          |
| **GitHub CLI (`gh`)**                | Issues, PRs and checks from the terminal; Claude Code uses it well.                                                                   |

## Part 4: Questions worth asking

### Of the agent

**Exploring**

- "Which package would I change to do X? What else depends on it?"
- "Show me how a backup runs from the button click to files on disk."
- "What are the architecture rules, and which of them would my change come close to?"

**Building and running**

- "How do I run `<package>` locally, and what credentials does it need?"
- "The build failed with this error; what is the cause, and is it my change or my setup?"

**Changing**

- "Before you edit anything, tell me which files you will touch and why."
- "Is there an existing helper or component for this before we write a new one?"
- "Write a test that fails without this change, then make it pass."

**Checking**

- "Run typecheck, lint and the tests for just the packages this change affects."
- "Take a screenshot of the screen I changed and show me." (for any visible change)
- "Review this diff as if you were the maintainer. What would you push back on?"

### Of us (open an issue or a draft PR)

- "I want to do X. Is that wanted, and is it already in someone's plan?"
- "Which package or issue is the right home for this?"
- "I can't test this on a platform you support (Mac, Android). What would you need from me?"

Asking before you build something large saves everyone effort; a short issue is enough.

## Part 5: How this project is run

For readers who want the working method behind the repo.

- **Mostly built with Claude Code.** The architecture and decisions are human; most implementation is by
  agents working to the rules in [CLAUDE.md](../CLAUDE.md). Those rules are the project's memory of
  mistakes already made, so read them before changing a package boundary.
- **Monorepo with enforced boundaries.** Shared logic (`b-api`, `backup-engine`, `b-view`, `b-visual`) has
  no Electron, Chrome or Capacitor dependencies; the shells wrap it. ESLint enforces this. See
  [ARCHITECTURE.md](../ARCHITECTURE.md).
- **Issue first.** Non-trivial work starts from a GitHub issue, and issues are tracked on a project board
  (Backlog, Ready, In progress, In review, Done). New issues are added to it automatically.
- **Branch and worktree per piece of work.** Nothing is committed to `main`. With several agent sessions
  running at once, each piece of work gets its own branch and its own `git worktree`, so sessions cannot
  switch branches under each other:
  ```bash
  git worktree add .claude/worktrees/<topic> -b <branch-name> origin/main
  ```
  (`.claude/worktrees/` is gitignored.) A worktree starts without gitignored files such as `.env.local`,
  so copy that in or a build will silently have no client ID.
- **Scoped CI.** Pull requests run typecheck, lint and tests only for the packages a change can affect,
  plus their dependents (`scripts/ci-scope.mjs`). Root config changes run everything. You can run the
  same scoped task locally:

  ```bash
  node scripts/ci-scope.mjs run test --packages b-api,b-push
  ```

- **What CI does not cover.** The `b-mobile-pc` end-to-end suite, the Android emulator rig and the Android
  build are run locally by the maintainer; `CLAUDE.md` has the commands.
- **Independent review.** A fresh agent session reviews each PR before the maintainer looks at it, and
  posts its findings as one PR comment. The maintainer makes the merge decision.
- **Releases are the maintainer's.** Building and publishing the installers, the Store builds and the
  Android release are not part of a contribution; see [RELEASING.md](../RELEASING.md) if you are curious.

## Part 6: Contributing

1. **Find or open an issue.** Check [open issues](https://github.com/IanMStevenson/b-oss/issues) first
   (`good first issue` and `help wanted` are good starting points). For anything bigger than a small fix,
   open an issue describing what you want to do before you build it.
2. **Fork, then branch.** Never work on your fork's `main`. Use a branch (or a worktree, see above) named
   for the change, for example `fix/entry-date-collision`.
3. **Make the change with Claude Code.** Keep it to one thing. Follow the rules in `CLAUDE.md`
   (strict TypeScript, no `any`, lowercase-hyphenated names, package boundaries).
4. **Check it locally:**
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
   For a visible change, look at it running and include a screenshot in the PR.
5. **Open a pull request against `main`**, as a **draft** until you think it is ready. Fill in the
   template, and link the issue with `Closes #<number>` in the description.
6. **Sign the CLA.** The first time, the CLA Assistant bot comments on your PR; reply with exactly:

   > I have read the CLA Document and I hereby sign the CLA

   The text is in [CLA.md](../CLA.md). It must be signed before a PR can be merged. Contributions are
   licensed under GPL-3.0-or-later.

7. **Review.** Expect CI to run, an automated review comment, and then a human read. Change requests are
   normal. Push fixes to the same branch; the PR updates itself. Only the maintainer merges.

Pointers for a good PR: small and focused, tests for behaviour changes, no secrets or `.env.local`,
and a description that says what changed and how you checked it.

## When you get stuck

Paste the exact error to Claude Code and ask it to find the cause before it tries a fix. If that doesn't
resolve it, open an issue with the command you ran, the output, your OS, and your Node version
(`node -v`).
