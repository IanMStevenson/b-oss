# The `integration/b-site-relaunch` branch

Tracking epic: [b-oss#837](https://github.com/IanMStevenson/b-oss/issues/837). The long-running branch for
relaunching the website (`packages/b-site`) as a showcase with links to the app stores. It exists so the
live site at b-oss.dev stays as it is until Ian says it is time to launch.

## Rules

- **Nothing from this branch reaches `main` until Ian says launch.** The site deploys from `main`
  (Cloudflare), so a merge there is a publish.
- Every change is a PR **into this branch**, never `main`. Ian merges them.
- URLs already linked from elsewhere must not change (see `packages/b-site/README.md`); keep redirects.
- Do not run `deploy-stubs` or any release from this branch.
- Merge `main` into this branch from time to time so the final merge stays small, and always before launch.

## Previewing

```bash
npm run dev -w @b-oss/b-site      # http://localhost:4321
```

`site.yml` builds and link-checks PRs into this branch. It does not deploy.
