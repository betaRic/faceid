# Hosting build settings check

Run `npm run check:hosting-env` to check settings without building. The same
check is now the first step in `npm run build:hosting`, before output cleanup.
Use Node 22. A failure stops the command and shows setting names, never values.

This release uses a settings-free build, matching the verified preceding build.
The check allows `.env.development.local` because production builds ignore it.
It rejects `.env`, `.env.local`, `.env.production`, and `.env.production.local`.
It also rejects inherited application settings listed in `.env.example`, public
settings, test-database settings, Node preloads and Next's processed-env marker.
`NODE_ENV` may be unset or `production`. Use a fresh terminal if inherited settings
are present. Do not delete or rewrite local files to make the check pass; use a
separate settings-free build checkout when necessary.

This is intentionally conservative: even a valid production settings file is
rejected, because this build workflow does not silently choose among profiles.
If public build-time customization is needed, define a reviewed explicit build
profile first. Public `NEXT_PUBLIC_` values can be embedded during compilation;
changing them only on the host after building may not change compiled values.
The check does not validate live credentials or prove live-site readiness.
It protects this command, not a manually invoked `next build` or later edits.

## Existing deployment approach and verified limits

The user reports building locally, uploading through FileZilla to SmarterASP,
and updating after hours. `app.js` in this checkout starts production Next.js and
listens on `process.env.PORT`. Earlier deployment notes describe SmartASP's
httpPlatformHandler configuration and its assigned port. That hosting config is
not present in this checkout and the live control panel has not been inspected.
Do not replace the live configuration with a guessed file or a local IIS proxy.

For updates, preserve the host's working environment configuration and
`App_Data/veriface-files` (or its configured persistent photo directory).
Application upload files and persistent employee files are different things.
Keep the preceding application package. Upload the reviewed rebuilt application
and required runtime/source/model files, apply only pending database migrations,
then restart using the established hosting controls. Do not upload `.env` files
from this computer or copy the whole development directory onto the website.

The exact upload manifest still needs the actual deployed file layout and
migration ledger. This candidate includes migrations 0017 and 0018, plus any
earlier migrations missing on the host. Do not run test reset scripts on live data.
Current updates are on `codex/release-1-hardening` in
`D:\projects\faceid\.worktrees\codex-release-1-hardening`; the main checkout
still differs. A Git commit does not deploy or merge that checkout.
