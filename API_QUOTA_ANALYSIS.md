# 📊 MoodyDJ API & Quota Usage Analysis

This document outlines **exactly** when and where API calls are made across the MoodyDJ ecosystem. It helps diagnose why your YouTube or Firebase API quotas might be exhausting and provides visibility into the caching mechanics.

---

## 1. YouTube Data API v3 (The Heavy Quota Consumer)
The YouTube API is the most restrictive and expensive resource. Your backend (`server/routes/songs.js`) makes calls to the YouTube API.

### 🛑 WHEN the YouTube API is CALLED:
1. **Cache Misses on Startup (`/api/songs`)**:
   - If the backend's in-memory cache or Redis/database doesn't have the songs for a requested mood/artist combination, it triggers a `GET /youtube/v3/search` request.
   - Search requests cost **100 quota units** each (very expensive).
   - If a user logs in and requests a highly specific/rare artist that hasn't been cached, a search is performed.
2. **Fetching Missing Song Metadata (`/api/song/:id/stats`)**:
   - If a song ID is in the queue or playlist but its full metadata (duration, high-res thumbnail) is missing, the backend calls `GET /youtube/v3/videos`.
   - Video detail requests cost **1 quota unit** per batch.
3. **Daily Artist Pre-warming**:
   - If the system proactively attempts to "warm up" cache for artists requested in the `DailyArtistPrompt`, it might trigger multiple search requests if those artists aren't already cached locally.

### ✅ WHEN the YouTube API is SKIPPED (Safe Zones):
1. **Frontend `cachedSongsPool`**: Once the frontend fetches a batch of songs via `/api/songs`, it stores them in a massive `cachedSongsPool` in React state. Hitting the "Refresh" or "Reshuffle" buttons purely reorganizes this pool and **does not** hit the YouTube API.
2. **Queue Restoration**: The frontend saves the queue to `localStorage` (`moodydj_app_queue`). When you reopen the app or the PWA, it restores the queue locally. No YouTube API calls are made during initialization.
3. **Backend Memory Cache**: If a user selects "Arijit Singh" and the backend already fetched his songs earlier today, it returns the songs from the backend cache.

### 💡 Why Your YouTube Quota Might Exhaust Quickly:
- **Multiple Unique Artists**: If 10 users select 10 *different* artists, the backend must make 10 separate `search` requests (costing 1,000 units).
- **Restarting the Server**: If the backend only uses an in-memory variable for caching (instead of a persistent database like MongoDB/Redis), restarting the server wipes the cache, forcing it to fetch from YouTube again for the next requests.
- **Uncapped Search Results**: Requesting more than 50 items per search can trigger pagination loops, multiplying the 100-unit cost.

---

## 2. Firebase Firestore (Database Reads/Writes)
Firebase Firestore charges based on Document Reads, Writes, and Deletes. 

### 🛑 WHEN Firestore is CALLED:
1. **User Authentication & Profile (`userService.js`)**:
   - `getDoc(userRef)` is called on every fresh login/reload to fetch preferences.
   - `setDoc(userRef, { lastLogin })` updates the user's login timestamp.
2. **Recently Played History**:
   - When a song finishes playing, `saveHistory(userId, song)` writes to the `users/{userId}/history` subcollection. (1 Write per song played).
   - The app fetches `history` on load to populate the "Recently Played" section.
3. **Liked Songs & Artist Preferences**:
   - Liking a song or selecting a new artist writes directly to Firestore.
4. **Playlists System (`playlistService.js`)**:
   - Creating, editing, or deleting a playlist triggers 1 Write/Delete.
   - Adding a song to a playlist uses `arrayUnion` (1 Read, 1 Write).

### ✅ WHEN Firestore is SKIPPED (Safe Zones):
1. **No Realtime Listeners**: The app deliberately avoids using `onSnapshot` (realtime listeners). All data is fetched via `getDocs` **once** on demand.
2. **Aggressive `localStorage` Caching**:
   - **Playlists** are cached in `localStorage` (`moodydj_playlists_{userId}`) for 5 minutes. Opening the Add to Playlist modal repeatedly within 5 minutes costs **0 Reads**.
   - **Song Metadata** is cached in `moodydj_song_cache` (up to 500 songs). Resolving song IDs inside a playlist uses this local cache instead of hitting the database.
   - **Liked Songs** are cached locally. Toggling likes optimistically updates the UI first.

### 💡 Why Your Firebase Quota Might Exhaust:
- **Spamming the Player**: If you skip through 50 songs rapidly, the `saveHistory` function might trigger 50 Writes to Firestore.
- **Clearing Browser Cache**: If users constantly clear their browser cache, the app falls back to fetching everything from Firestore on every reload.

---

## 3. Recommended Fixes for Quota Exhaustion
1. **Implement Backend Persistent Cache**: Ensure `server/routes/songs.js` saves YouTube API search results to a persistent database (like MongoDB or Firestore) rather than just an in-memory array. This prevents server restarts from wiping out expensive search data.
2. **Debounce Firestore Writes**: If `saveHistory` is called too frequently (e.g., when skipping tracks), add a debounce or require a song to play for at least 30 seconds before writing it to the database.
3. **Monitor `DailyArtistPrompt`**: Ensure the daily artist prompt doesn't trigger automated background YouTube searches for hundreds of obscure artists at once.
4. **YouTube Quota Fallback**: Ensure the backend's "QUOTA SAFE MODE" actively serves older cached JSON files when the API returns a `403 Quota Exceeded` error.
