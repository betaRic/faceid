# IIS Deployment on Windows Server 2022 Datacenter

This deployment is local to your server, but the current app still uses Firebase and Redis unless the storage layer is redesigned. The target shape is:

```text
LAN / office users
  -> https://your-faceattend-hostname
  -> IIS on Windows Server 2022
  -> ARR reverse proxy
  -> Next.js on Node.js at 127.0.0.1:3000
  -> Firebase / Redis
```

FaceAttend is a dynamic Next.js app with API routes. Do not deploy it as static IIS content. IIS should terminate HTTPS and proxy traffic to a supervised Node.js process.

## 1. Server Prerequisites

Install on Windows Server 2022 Datacenter:

- Node.js 22 x64
- Git, or another controlled deployment method
- IIS Web Server role
- IIS URL Rewrite module
- IIS Application Request Routing
- TLS certificate trusted by all devices using `/scan` and `/registration`

Camera access requires a secure browser context. In practice, use HTTPS with a trusted certificate, even on LAN.

Install the core IIS role from elevated PowerShell:

```powershell
Install-WindowsFeature Web-Server,Web-Common-Http,Web-Default-Doc,Web-Static-Content,Web-Http-Errors,Web-Http-Redirect,Web-Health,Web-Http-Logging,Web-Request-Monitor,Web-Performance,Web-Stat-Compression,Web-Security,Web-Filtering,Web-Mgmt-Tools,Web-Mgmt-Console
```

URL Rewrite and Application Request Routing are separate IIS extensions. After installing them, open IIS Manager, select the server node, open **Application Request Routing Cache**, choose **Server Proxy Settings**, and enable proxy.

## 2. Recommended Folders

Keep the application and IIS proxy site separate:

```powershell
New-Item -ItemType Directory -Force C:\Sites\FaceAttend
New-Item -ItemType Directory -Force C:\inetpub\faceattend-proxy
New-Item -ItemType Directory -Force C:\Sites\FaceAttend\logs
```

Use:

```text
C:\Sites\FaceAttend
```

for the repo/app.

Use:

```text
C:\inetpub\faceattend-proxy
```

for the IIS site physical path. Copy [web.config](../deploy/iis/web.config) there as:

```text
C:\inetpub\faceattend-proxy\web.config
```

This prevents IIS from directly serving your source code, `.env.local`, `node_modules`, or build internals.

## 3. Environment Configuration

Use either real machine/service environment variables or:

```text
C:\Sites\FaceAttend\.env.local
```

This repo's helper scripts currently load `.env` and `.env.local`, and Next.js production also reads `.env.local`.

Required baseline values:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
ADMIN_SESSION_SECRET=
HR_SESSION_SECRET=
HR_PIN_SALT=
CRON_SECRET=
EMPLOYEE_VIEW_SESSION_SECRET=
NEXT_PUBLIC_SITE_URL=https://your-faceattend-hostname
REDIS_URL=
```

Recommended values for this Windows Server deployment:

```env
NEXT_PUBLIC_USE_LOCAL_MODELS=false
SERVER_ATTENDANCE_PAD_ENABLED=false
INCLUDE_OPENVINO_RUNTIME=true
OPENVINO_SHADOW_ENABLED=true
OPENVINO_SHADOW_FRAMES_PER_SCAN=2
```

Important notes:

- `NEXT_PUBLIC_SITE_URL` must exactly match the IIS HTTPS origin users will open.
- If `NEXT_PUBLIC_SITE_URL` or any `NEXT_PUBLIC_` Firebase value changes, rebuild the app.
- Store `FIREBASE_SERVICE_ACCOUNT_JSON` as one escaped JSON line, not as a loose JSON file under the IIS site.
- If Google admin login is used, add the local server hostname to Firebase Authentication authorized domains.

Restrict secrets:

```powershell
icacls C:\Sites\FaceAttend\.env.local /inheritance:r
icacls C:\Sites\FaceAttend\.env.local /grant:r Administrators:F
icacls C:\Sites\FaceAttend\.env.local /grant:r "YOURDOMAIN\svc-faceattend:R"
```

Replace `YOURDOMAIN\svc-faceattend` with the Windows account that runs the Node process.

## 4. Install and Build the App

Run from the server:

```powershell
cd C:\Sites\FaceAttend
node -v
npm ci
npm run openvino:download-models
npm run check:env
npm test
npm run build
npm run openvino:smoke -- --check
```

Expected runtime:

```text
Node.js 22.x
```

Do not deploy this on Node 18. Avoid Node 24 unless you intentionally upgrade and retest the app.

## 5. Manual Local Smoke Test

Start the app manually first:

```powershell
cd C:\Sites\FaceAttend
$env:NODE_ENV = 'production'
node .\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
```

In another elevated PowerShell:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing
```

Expected result:

```json
{"ok":true,"service":"faceattend"}
```

Stop the manual process after this check.

## 6. Run Node as a Supervised Service

Use a proper service wrapper such as NSSM or WinSW. If you want to stay built-in only, Task Scheduler can work, but a service wrapper is cleaner for restart behavior and logs.

Service settings:

```text
working directory: C:\Sites\FaceAttend
executable: C:\Program Files\nodejs\node.exe
arguments: .\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
environment: NODE_ENV=production
startup: automatic
stdout log: C:\Sites\FaceAttend\logs\faceattend.out.log
stderr log: C:\Sites\FaceAttend\logs\faceattend.err.log
```

The Node server should bind only to `127.0.0.1`. Do not expose port `3000` on the Windows Firewall.

## 7. Configure IIS

In IIS Manager:

1. Create an app pool named `FaceAttendProxy`.
2. Set `.NET CLR version` to **No Managed Code**.
3. Create a site named `FaceAttend`.
4. Set physical path to `C:\inetpub\faceattend-proxy`.
5. Bind HTTPS to the hostname used in `NEXT_PUBLIC_SITE_URL`.
6. Assign the `FaceAttendProxy` app pool.
7. Confirm ARR proxy is enabled at the server level.

The deployed `web.config` proxies all traffic to:

```text
http://127.0.0.1:3000
```

It also redirects HTTP to HTTPS and allows request bodies up to 50 MB for enrollment/capture payloads.

## 8. Firewall and DNS

Open inbound HTTPS only:

```powershell
New-NetFirewallRule -DisplayName "FaceAttend HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

Create an internal DNS record such as:

```text
faceattend.yourdomain.local -> SERVER_IP
```

Use that same hostname in:

```env
NEXT_PUBLIC_SITE_URL=https://faceattend.yourdomain.local
```

Avoid using raw IP addresses for production because certificates, Firebase auth domains, cookies, and user trust are easier to handle with a stable hostname.

## 9. Firestore Rules and Indexes

From the server or a trusted admin workstation:

```powershell
cd C:\Sites\FaceAttend
firebase deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
npm run sync:firestore-indexes
npm run backfill:biometric-index
npm run warm:biometric-cache
```

Run `backfill:biometric-index` when deploying against an existing Firebase project that already has person biometrics.

## 10. Final Validation

Server-side:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing
Invoke-WebRequest https://your-faceattend-hostname/api/health -UseBasicParsing
```

Browser checks:

- `/admin/login`
- `/admin`
- `/registration`
- `/scan`
- `/api/system/status` after regional admin login

Real-device checks:

- phone can open the HTTPS hostname
- browser asks for camera permission
- browser asks for geolocation permission
- registration capture works
- attendance scan works
- admin login works
- HR/DTR export works

## 11. Common Failure Points

- 403 on writes: `NEXT_PUBLIC_SITE_URL` does not exactly match the IIS HTTPS origin.
- Camera does not open: the site is not loaded over trusted HTTPS.
- Google login fails: the server hostname is missing from Firebase Authentication authorized domains.
- App works on `127.0.0.1:3000` but not through IIS: ARR proxy is not enabled or URL Rewrite is missing.
- Browser uses old Firebase/site values: rebuild after changing `NEXT_PUBLIC_` variables.
- Service starts but Firebase fails: the service account cannot read `.env.local` or service-level variables.
- Enrollment fails with a large request: confirm the IIS `web.config` request limit is deployed.
- OpenVINO shadow warning appears: confirm `INCLUDE_OPENVINO_RUNTIME=true` was present before build and model files exist under `public\models\openvino`.

## References

- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js environment variables: https://nextjs.org/docs/app/guides/environment-variables
- Microsoft IIS URL Rewrite + ARR reverse proxy: https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing
- Browser camera secure context requirement: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
