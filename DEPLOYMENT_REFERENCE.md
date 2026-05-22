# 🚀 MoodyDJ: Production Deployment Reference & Architecture Guide

This document contains all the technical details, architecture dependencies, API structures, and configuration adjustments necessary to prepare a production deployment plan for the MoodyDJ application.

---

## 🛠️ 1. Technical Stack

MoodyDJ is structured as a decoupled **Client-Server Architecture** comprising a single-page React frontend and an Express Node.js backend.

### Frontend (Client)
* **Framework**: React 19 (bootstrapped with Vite)
* **Routing**: React Router DOM v7
* **Animations**: Framer Motion
* **Styling**: Vanilla CSS (Tailwind-free for granular flexbox/grid alignments)
* **Local Database**: IndexedDB (Native API, storing a master catalog of ~700–1000 songs to enable offline play and zero-API playback)
* **Auth State**: Local Firebase JS SDK (with `browserLocalPersistence` enabled for PWAs)

### Backend (Server)
* **Framework**: Node.js + Express
* **Database & Auth verification**: Firebase Admin SDK (`firebase-admin`)
* **API Proxy**: Axios (for querying YouTube Data API v3)
* **Environment Configuration**: `dotenv`

---

## ⚙️ 2. Environmental Configuration & Variables

Both client and server rely on environmental configuration keys.

### Client-Side Variables (`/client/.env` or build pipeline settings)
| Key | Type | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | String | `http://localhost:5000` | The fully qualified URL of the deployed Express backend. |

*Note: In Vite, client-side environment variables must be prefixed with `VITE_` and are baked into the minified Javascript bundle at build time.*

### Server-Side Variables (`/server/.env` or hosting provider configurations)
| Key | Type | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `YOUTUBE_API_KEY` | String | *(Required)* | Google Developer Console API key for YouTube Data API v3. |
| `PORT` | Integer | `5000` *(Internal default)* | Port on which the Express server binds. |

---

## 🔒 3. System & Database Dependencies

Deploying MoodyDJ successfully requires configuring authentication keys and persistent file stores.

### 🔑 A. Firebase Service Account Configuration
The backend server uses Firebase Admin SDK to perform reads and writes to Firestore.
* **Current Setup**: The server loads a local JSON file at `/server/serviceAccount.json`.
* **Deployment Recommendation**: Storing JSON keyfiles in source control is a security risk. To deploy to cloud environments (Render, Heroku, AWS):
  1. Refactor `/server/firebaseAdmin.js` to parse the JSON contents directly from an environment variable:
     ```javascript
     const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
     admin.initializeApp({
       credential: admin.credential.cert(serviceAccount)
     });
     ```
  2. Set `FIREBASE_SERVICE_ACCOUNT` as a multi-line string configuration variable on your hosting dashboard.

### 📁 B. Persistent Cache Storage (`cache.json`)
The Express server writes all YouTube search results and video statistics to `/server/cache.json` to shield YouTube API quota limits (12-hour search caching).
* **Current Setup**: Simple file reads/writes on local disk.
* **Deployment Recommendation**: Most cloud containers (Render, Heroku) use ephemeral file systems, meaning `cache.json` is deleted on every deploy or daily restart, leading to quota exhaustion.
  * **Option A**: Mount a Persistent Volume pointing to `/server/` on your cloud provider (e.g. Render Disk).
  * **Option B**: Replace the local JSON read/write logic with a managed **Redis** instance or standard **Firestore Collection** writes.

---

## 🌐 4. API Endpoints Reference

The backend exposes the following routes under the `/api` prefix:

### Authentication & Onboarding
* `GET /api/onboarding-status?userId=UID`
  * **Description**: Verifies if the user completed their artist onboarding in the last 12 hours.
  * **Security**: Reads header Firebase ID token or checks query UID.
* `POST /api/complete-onboarding`
  * **Description**: Saves the user's selected artists and completion timestamp to Firestore.
  * **Payload**: `{ selectedArtistIds: ["artist1", "artist2"] }`

### Catalog & Music Operations
* `POST /api/prewarm-artists`
  * **Description**: Aggregates popular tracks and playlists for up to 10 artists, scoring the metadata and packaging a pool of ~700-1000 songs.
  * **Payload**: `{ artists: ["Arijit Singh", "Kishore Kumar"] }`
* `GET /api/song/:videoId/stats`
  * **Description**: Proxies request for view count, likes, and description for a song. Returns cached details if available; queries YouTube if not.
* `POST /api/like` / `POST /api/dislike`
  * **Description**: Updates user liked/disliked records and artist weight factors in Firestore.
  * **Payload**: `{ sessionId, videoId, title, channelTitle, userId }`
* `POST /api/songs/metadata`
  * **Description**: Returns statistics and duration for a bulk list of Video IDs.
  * **Payload**: `{ videoIds: [...] }`
* `GET /api/quota-status`
  * **Description**: Returns current YouTube API daily quota utilization metrics.

---

## 🛠️ 5. Deployment Build Pipeline & Commands

### Client (React / Vite)
1. **Directory**: `/client`
2. **Installation**: `npm install`
3. **Build Command**: `npm run build`
4. **Output Directory**: `/client/dist` (contains static HTML/JS/CSS assets)
5. **Hosting Options**: Can be deployed to static hosting platforms like Vercel, Netlify, Firebase Hosting, or Cloudflare Pages.

### Server (Express Node.js)
1. **Directory**: `/server`
2. **Installation**: `npm install`
3. **Start Command**: `node index.js`
4. **Environment Requirements**: Node.js v18+ runtime
5. **Hosting Options**: Deployed to web services such as Render Web Service, Heroku, AWS App Runner, or DigitalOcean App Platform.

---

## 🚨 6. Required Code Adjustments for Production

Before launching a production deployment, ensure you apply the following two code patches:

### Patch 1: Dynamic Port Binding (`/server/index.js`)
Currently, the server binds to port `5000` via a hardcoded statement. Cloud environments assign random ports dynamically via `process.env.PORT`.
* **Locate**: `/server/index.js:L129-L131`
* **Change from**:
  ```javascript
  app.listen(5000, () => {
    console.log("Server running on port 5000");
  });
  ```
* **Change to**:
  ```javascript
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  ```

### Patch 2: CORS Domain Locking (`/server/index.js`)
Currently, CORS permits all cross-origin requests. For security, lock this down to your deployed frontend domain.
* **Locate**: `/server/index.js:L10`
* **Change from**:
  ```javascript
  app.use(cors());
  ```
* **Change to**:
  ```javascript
  app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
  }));
  ```
