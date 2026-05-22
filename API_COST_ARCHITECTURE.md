# 📊 MoodyDJ: API Cost & Caching Architecture Guide

This document explains **exactly** when API calls are triggered, **how many** YouTube and database resources they consume, and the **Local-First Architecture** designed to minimize API costs.

---

## 🗺️ Architectural Overview

MoodyDJ shifts recommendation, queue construction, and caching logic from the server to the client. The backend acts as a **smart crawler, validation gateway, and persistent cache proxy**, while the client's browser operates as the **primary database and recommendation engine**.

```mermaid
graph TD
    User([User selects Mood/Blend]) --> ClientEngine[client/src/services/localEngine.js]
    ClientEngine --> IndexedDB[(IndexedDB: master_songs)]
    IndexedDB -- Returns ~700-1000 songs -- > ClientEngine
    ClientEngine -- Filters Dislikes / Ensures Diversity -- > PlaybackQueue[Active Playback Queue]
    
    subgraph "Zero API Playback Loop (0 Cost)"
        ClientEngine
        IndexedDB
        PlaybackQueue
    end
    
    subgraph "Onboarding / DB Repair (First-time or 12h Expired)"
        Onboard[Daily Onboarding / DB Repair] --> PrewarmAPI["POST /api/prewarm-artists"]
        PrewarmAPI --> ArtistCache{artistCache in-memory / cache.json}
        ArtistCache -- Cache Hit (TTL 12h) -- > ReturnCached[Return cached songs]
        ArtistCache -- Cache Miss -- > YTAPI[YouTube Data API v3]
        YTAPI -- GET Search (100 units) -- > FetchSongs
        YTAPI -- GET Videos (1 unit) -- > FetchDetails
        FetchSongs --> ScoredCache[scoredVideosCache / cache.json]
        FetchDetails --> ScoredCache
        ScoredCache --> SaveToDB[Save to IndexedDB]
    end
```

---

## ⏱️ Exact API Call Triggers & Quota Consumption

MoodyDJ interacts with two external services: **YouTube Data API v3** (sensitive quota limits) and **Firebase Firestore** (document reads/writes).

### 1. YouTube Data API v3 Quota Costs

The YouTube API uses a daily allocation of **10,000 quota units**. 

| Trigger / Action | API Endpoint called | Quota Cost (Per Event) | How it saves Quota / Details |
| :--- | :--- | :--- | :--- |
| **Onboarding / Daily Artist Selection** | `POST /api/prewarm-artists` | **0 units** (Cache Hit)<br>**201 units** (Cache Miss, per Artist) | Fetches up to 10 selected artists. If an artist is in the backend's persistent `artistCache` (< 12 hours old), it costs **0 units**.<br>If uncached, it runs 2 search pages (200 units) + 1 video details batch (1 unit). |
| **Database Check & Repair** *(Background)* | `POST /api/prewarm-artists` | **0 units** (Cache Hit)<br>**201 units** (Cache Miss, per Artist) | Triggers automatically if the client's local IndexedDB count drops below 100 songs (e.g., legacy users with broken databases). Restores the 700–1000 song pool using caches. |
| **Song Playback / Changing Track** | `GET /api/song/:videoId/stats` | **0 units** (Cache Hit)<br>**1 unit** (Cache Miss) | Fetches view count, like count, and description for the active track. If statistics are already in the backend's `scoredVideosCache` (TTL: 60 mins), returns them instantly at **0 cost**. |
| **Playlists / Video Metadata Batch** | `POST /api/songs/metadata` | **0 units** (Cache Hit)<br>**1 unit** (per 50 songs) | Used when importing playlists or retrieving video details in bulk. Retrieves as much as possible from `scoredVideosCache`, querying YouTube in batches of 50 for misses. |
| **Solo Mode Initial / Refresh** | `POST /api/solo-songs` | **0 units** (Cache Hit)<br>**201 units** (Cache Miss, per Artist) | *(Legacy fallback)* Fetches custom artist pools. Now bypassed by the local engine in primary mood workflows. |
| **Prefetching Upcoming Songs** | `POST /api/prefetch-next` | **0 units** | Prefetches next items from cache. Explicitly skips YouTube search requests if there is a cache miss to prevent backend quota hits during playback. |

### 2. Firebase Firestore Database Costs

Firestore billing is based on document reads, writes, and deletes.

| Trigger / Action | Operation | Firestore Cost | Details |
| :--- | :--- | :--- | :--- |
| **App Startup / Auth State Change** | `getDoc(userRef)` | **1 Read** | Retrieves user preferences, onboarded timestamps, and selected artist IDs. |
| **Completing Daily Onboarding** | `setDoc(userRef)` | **1 Write** | Updates selected artists and onboarding timestamps. |
| **Liking a Song** | `POST /api/like` | **2 Reads, 3 Writes** | Increments the user's liked artist count (1R/1W), increments liked keyword counts (1R/1W), and logs the video details under the `likedSongs` subcollection (1W). |
| **Disliking a Song** | `POST /api/dislike` | **2 Reads, 2 Writes** | Appends the video ID (1R/1W) and artist name (1R/1W) to the user's dislike preference array. |
| **Listening to a Track (>20s)** | `saveHistory` | **1 Write** | Logs the track to the user's historical play subcollection. |

---

## 🏛️ Cost-Saving Architecture (Zero-API Playback)

To avoid consuming YouTube and Firestore API units during normal app usage, MoodyDJ implements the following architecture:

### 💾 Layer 1: Client-Side IndexedDB Database
Instead of querying the backend every time a user refreshes or changes their mood, the client builds their own local library in the browser.
* **Onboarding Prewarm**: The backend returns a consolidated pool of **~700–1000 songs** containing deep listings of popular tracks, hits, and associated seeds.
* **IndexedDB Store**: All songs are stored locally in the browser's persistent `master_songs` object store inside IndexedDB, with optimized indices on `moodTags` and `artistNormalized`.
* **Thumbnail Compression**: The backend rewrites all video thumbnail URLs to the medium-resolution `mqdefault.jpg` format. This decreases IndexedDB storage size and saves significant mobile network bandwidth.

### 🧠 Layer 2: Client-Side Local Recommendation Engine (`localEngine.js`)
When a user switches moods, clicks **"Refresh"**, or plays the next track, queue generation is handled entirely on the client's device:
1. **Index Selection**: Fetches relevant songs from IndexedDB based on the chosen mood.
2. **Dislike Filtering**: Instantly filters out video IDs that the user has disliked, and assigns low priority to songs by disliked artists.
3. **Artist Diversity Protection**: Shuffles and groups songs by artist, drawing from them in a round-robin cycle to prevent the player from repeating the same artist sequentially.
4. **Recent Song Avoidance**: Excludes the last 50 played tracks to maintain playback freshness.
5. **Recycling fallback**: If the unplayed song pool is depleted, it recycles the oldest played tracks first to keep the music going forever without calling external APIs.

### 🛡️ Layer 3: Server-Side Global Cache (`cache.json`)
The backend uses multiple persistent and memory cache layers to shield the YouTube API:
* **`artistCache` (12-Hour TTL)**: Stores the scraped songs list for every artist globally. Multiple users selecting the same artist within a 12-hour window hit the cache, costing **0 YouTube API units**.
* **`scoredVideosCache` (60-Min TTL)**: Stores specific video statistics and metadata.
* **Reject Caching (Shorts & Covers)**: Videos matching YouTube Shorts duration (< 120 seconds) or covers matching cover regex patterns are marked as `rejected: true` and cached. They are never queried again.
* **404 Auto-Mocking**: If a video is deleted, private, or blocked, the backend intercepts the YouTube API 404 error, saves a mock stats object, and tags it as `rejected: true` to prevent future API attempts.

### 🚥 Layer 4: Hardcoded Fallbacks & System Quota Tracker
The backend monitors exact quota usage in real-time, persisting stats under the Firestore `system/quotaTracker` document:
* **Quota Guard (7,000 units)**: If the system estimates an upcoming call will exceed the safe daily threshold of 7,000 quota units, it halts live queries and falls back to cached results.
* **Zero API Mode (8,500 units)**: If quota hits 8,500 units, the server enters Zero API Mode. Live searches are completely bypassed, and pools are built strictly from `artistCache`, `scoredVideosCache`, and backend static `SEED_SONGS`.
* **Frontend Seed Fallback (`FRONTEND_SEED_SONGS`)**: If IndexedDB fails to initialize or is empty (e.g. offline use), the client immediately populates IndexedDB with a high-quality selection of built-in songs, guaranteeing zero-state safety.
