# SmartASP Operations

## Hosting contract

VeriFace is a dynamic Node.js application. SmartASP starts root `app.js` through root `web.config` and `httpPlatformHandler`. It is not a static export and does not use the obsolete IIS reverse-proxy configuration formerly stored under `deploy/iis`.

Required remote items:

- `.next/` production artifact
- installed Node.js dependencies required by the artifact
- `app.js`, `package.json`, and Next configuration when those files change
- `public/` assets when assets change
- root `web.config`
- remote `.env`
- persistent `App_Data/veriface-files/`

## Build

Use Node.js 22:

```powershell
npm ci
npm test
npm run build:hosting
```

`build:hosting` removes stale development output, runs the Next production build, then replaces Turbopack Windows Junction package aliases in `.next/node_modules` with physical runtime files suitable for FileZilla.

Do not call the artifact deployable unless:

- the build command exits successfully;
- `.next/BUILD_ID` exists;
- required `pg`, `sharp`, Human/TensorFlow, and other traced runtime packages are present; and
- no materializer error or unresolved deployment alias remains.

## Normal upload

For a normal verified application update, upload the completed `.next/` directory. Upload an additional root/source/configuration file only when the release diff explicitly changes that file and the hosting runtime needs it. Do not upload local `.env` files, local PostgreSQL data, `.git`, temporary output, test photos, Graphify/CodeGraph data, or portable tool runtimes.

If `package.json` or runtime dependencies change, update production dependencies through the provider-supported install process or the exact verified Node 22 dependency artifact. Do not assume an old `node_modules` tree satisfies a new lockfile.

## Preserve remotely

Never replace or delete:

- remote `.env` and hosting-managed environment values;
- `App_Data/veriface-files/`;
- production database content;
- hosting logs until incident evidence is collected; or
- provider-controlled configuration outside the application root.

## Release order

1. Freeze the application and migration set.
2. Take and validate a fresh production backup.
3. Restore to a disposable local clone.
4. Apply the final migrations locally and verify preservation.
5. Run route, full, browser/workflow, and hosting-build gates locally.
6. Present the exact production migration and upload list.
7. Obtain separate production approval.
8. Take an immediate pre-change backup.
9. Apply approved migrations, upload the matching artifact, restart, and smoke test.

Cleanup work in this repository does not authorize steps 8 or 9.

## Production triage

Check in this order:

1. `/api/health` for Node/Next startup.
2. The failing application route.
3. SmartASP `logs/node*.log`.

An identical PostgreSQL authentication failure across unrelated routes points to shared `DATABASE_URL`/pool authentication before business logic. A blank 500 mentioning generated `pg-*` or `sharp-*` packages points to incomplete hosting-artifact materialization.
