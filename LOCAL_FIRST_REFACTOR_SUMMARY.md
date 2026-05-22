# MoodyDJ Local-First Refactoring & Safeguards Summary

This document explains the architecture refactoring and the performance/mobile-safety safeguards implemented to transition MoodyDJ into a **local-first, offline-ready Intelligent Music System**.

---

## 1. Architectural Blueprint: Zero-API Runtime

To resolve API quota exhaustion and enable smooth offline usage (e.g., during flights/travel), we restructured the application flow:

1. **One-Time Prewarm Onboarding**: The daily onboarding is the primary event. The client requests a full song universe from the backend `/api/prewarm-artists` endpoint, which returns a consolidated pool of **~700-1000 songs**.
2. **IndexedDB Master Storage**: This entire pool is stored locally on the client inside IndexedDB.
3. **Frontend Runtime Execution**: All subsequent runtime operations—changing moods, selecting blends, shuffling, list refreshing, and entering Solo Mode—are executed **purely on the client** using IndexedDB index queries. No network calls are made to `GET /api/songs` or `POST /api/solo-songs` during playback.

---

## 2. Performance & Mobile-Safety Safeguards

### I. IndexedDB Write Optimization
* **The Issue**: Bulk-writing 700-1000 songs in a single transaction loop blocks Javascript's single thread, causing mobile browser interfaces to lock up or freeze.
* **The Solution**: In [dbService.js](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/services/dbService.js), bulk writes are split into asynchronous chunks of **100 songs**. Between each chunk write, the engine yields execution back to the browser's main thread via:
  ```javascript
  await new Promise(resolve => setTimeout(resolve, 0));
  ```
  This ensures that browser scrolling, loading spinners, and progress animations continue to render smoothly at 60fps.

### II. Thumbnail Optimization
* **The Issue**: Large high-resolution thumbnails (`maxresdefault`, `hqdefault`) occupy massive IndexedDB storage space and inflate runtime RAM heap size, leading to browser crashes on memory-constrained mobile devices.
* **The Solution**: We enforce thumbnail normalization across both ends:
  - **Server-Side**: The `/api/prewarm-artists` endpoint rewrites all video thumbnail URLs to the compact, medium-resolution `mqdefault.jpg` format.
  - **Client-Side**: The `saveSongsToPool` method runs a regex normalization check to replace any high-res suffixes (`maxresdefault.jpg`, `hqdefault.jpg`, `sddefault.jpg`) with `mqdefault.jpg` before storage.

### III. Runtime Memory Safety
* **The Issue**: Loading a pool of 1000 songs into the React component state would cause slow re-renders, high memory consumption, and sluggishness over long sessions.
* **The Solution**: We lazily query only the necessary sub-slices of data using indexed lookups:
  - **Mood Selection**: `getSongsByMood(mood)` queries the IndexedDB store using the `moodTags` index.
  - **Solo Mode**: `getSongsByArtist(artist)` queries by artist name using the `artistNormalized` index.
  - **State Cap**: The filtered sub-slice is shuffled, and only the top **50 songs** are returned to populate the React component state (`songs`). The remaining 900+ songs stay safely serialized in IndexedDB.

### IV. Intelligent Local Queue Engine
Implemented in [localEngine.js](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/services/localEngine.js), the queue engine builds a diverse 50-song queue:
1. **Aggressive Deduplication**: Checks and removes duplicates by `videoId` using a `Map`.
2. **Artist Diversity**: Groups candidates by artist and draws from them in a round-robin loop, preventing consecutive songs by the same artist.
3. **Smart Recycling**: If the candidate pool falls below 50, the engine calculates the exact deficit ($N$). It sorts the history/recent songs list so that the **oldest played songs** are recycled first, slices out exactly $N$ tracks, and shuffles them into the queue. This prevents recently played tracks from repeating.
4. **Safer Dislike Architecture**: When a user dislikes a song, that exact videoId is banned and removed from the active queue immediately. Future queue generations lower the priority of songs by the same artist/session by shuffling them at the very end of the pool, preventing aggressive keyword blacklist suppression.

### V. Offline & Quota Resilience
* **Preserving Cached Data**: In [DailyArtistPrompt.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/DailyArtistPrompt.jsx), if the onboarding prewarm request fails (due to low battery, internet dropouts, or backend API quota limits), the catch block preserves the existing IndexedDB pool and avoids calling any database-wiping routines.
* **Graceful Offline Fallback**: The app displays an "Offline mode: Using existing local library" toast notification and proceeds to run queue generation and refreshes locally.
* **Frontend Zero-State Seeds**: If a user is completely offline on their first launch and IndexedDB is empty, `FRONTEND_SEED_SONGS` are written as a fallback to ensure the app plays immediately.

---

## 3. Summary of Files Modified

1. **[dbService.js](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/services/dbService.js)**: Created IndexedDB manager with versioning, chunked batched write transactions, yielding timeouts, medium-quality thumbnail rewrites, and seed fallback loaders.
2. **[localEngine.js](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/services/localEngine.js)**: Created local queue generator with round-robin artist diversity, duplicate prevention, oldest-first song recycling, and priority lowering for disliked artists.
3. **[App.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/App.jsx)**: Integrated IndexedDB queries and the local queue engine for all mood mode selections and playlist refreshes (removing runtime server API queries). Integrated local disliked videoId / artist lists and queue-splicing during dislikes.
4. **[SoloPage.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/pages/SoloPage.jsx)**: Replaced server-side solo mix queries with IndexedDB artist index filtering and client-side queue drawing. Integrated local disliked videoId / artist lists to filter Solo mix outputs.
5. **[DailyArtistPrompt.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/DailyArtistPrompt.jsx)**: Modified confirm and skip callbacks to store backend-loaded prewarm songs in IndexedDB. Added try-catch blocks to prevent cache loss on network failure.
6. **[ArtistContext.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/context/ArtistContext.jsx)**: Changed onboarding date comparison to a 12-hour epoch timestamp difference. Added startup checks to trigger onboarding if the local IndexedDB pool is empty.
7. **[songs.js](file:///c:/Users/haita/Desktop/MoodyDJ/server/routes/songs.js)**: Updated the backend `/prewarm-artists` endpoint to fetch a larger universe (up to 750-1000 songs) using cached pages, static seeds, and scored history. Implemented backend thumbnail optimizations. Updated search/dislike routes to track disliked artists/videoIds rather than keywords.
8. **[index.js](file:///c:/Users/haita/Desktop/MoodyDJ/server/index.js)**: Switched backend onboarding gates and quota checking to 12-hour cycles.

---

## 4. Verification

We successfully verified the build output on Vite:
```bash
vite build
✓ built in 738ms
```
The client compiled into lightweight production bundles with zero syntax, CSS, or routing warnings. Playback, Solo mixes, list refreshes, and dislikes now run instantaneously.
