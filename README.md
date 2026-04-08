# Face ID System — DILG General Santos City

## Architecture

| Feature | Engine |
|---------|--------|
| **Detect** (age, gender, emotion, glasses) | Azure Face API |
| **Register** (enroll persons) | face-api.js (local, browser-based) |
| **Identify** (recognize faces) | face-api.js (local, browser-based) |

> Azure Identification/Verification requires Microsoft approval. This app uses face-api.js locally for registration and identification — no approval needed, data stays on device.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Download face-api.js model weights
Run this script to download the required model files:
```bash
node scripts/download-models.js
```
This downloads ~6MB of model weights into `public/models/`.

### 3. Start the dev server
```bash
npm run dev
```

Open http://localhost:5173 in Chrome.

---

## Build for Production
```bash
npm run build
npm run preview
```

---

## How to Use

### Detect Tab
1. Click **Start Camera**
2. Click **Scan Now**
3. Azure returns age, gender, emotion, glasses

### Register Tab
1. Click **Start Camera**
2. Click **Capture Face** — point your face clearly at the camera
3. Enter the person's name
4. Click **Register Person**
5. Add multiple face samples (+face) for better accuracy

### Identify Tab
1. Register at least one person
2. Click **Start Camera**
3. Click **Identify Face**
4. Results show name + confidence score

---

## Configuration
Edit `src/config.js`:
```js
export const AZURE_ENDPOINT = 'https://your-resource.cognitiveservices.azure.com'
export const AZURE_KEY = 'your-key'
export const DISTANCE_THRESHOLD = 0.5  // lower = stricter matching
```

## Notes
- Registered persons are stored in **localStorage** — they persist across sessions
- Models load once on startup (~6MB, ~3-5 seconds)
- HTTPS or localhost required for camera access
- Chrome recommended
# faceid
