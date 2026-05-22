# 📊 MoodyDJ API & Quota Usage Analysis

This document outlines **exactly** when, where, and why API calls (YouTube API & Firebase Firestore) are made across the MoodyDJ ecosystem. It helps diagnose quota exhaustion and documents the optimizations implemented to ensure quota safety.

---

## 1. YouTube Data API v3 (Quota Triggers)

The YouTube Data API v3 has a daily limit and is highly sensitive to quota consumption.

### 🛑 WHEN the YouTube API is CALLED:

1. **Daily Artist Pre-warming (`POST /api/prewarm-artists`)**:
   - **Trigger**: Occurs when the user completes onboarding (the Daily Artist Selection popup) or selects "Keep Yesterday's Artists" after the 12-hour window has expired.
   - **API Calls**:
     - Calls `GET /youtube/v3/search` for popular songs and best hits playlists for each selected artist (up to 10 artists). Cost: **100 units** per search request.
     - Calls `GET /youtube/v3/videos` to fetch content details (duration) and snippet metadata to score and filter out YouTube Shorts. Cost: **1 unit** per batch of 50 video IDs.
   - **Cache Check**: If an artist is already in the backend's persistent `artistCache` (and has been cached for less than 12 hours), the search is skipped entirely.

2. **Solo Mode Mix Creation (`POST /api/solo-songs`)**:
   - **Trigger**: User starts playing Solo Mode or clicks "Refresh" in Solo Mode.
   - **API Calls**:
     - Checks the `artistCache` for each requested artist.
     - **Cache Miss**: If any artist is missing from the cache, the backend makes search queries (`GET /youtube/v3/search`) for that artist's songs. Cost: **100 units** per search query.
     - **Validation**: Fetched videos are passed through `toScoredQueue`, batch-querying `/youtube/v3/videos` to filter out Shorts and covers. Cost: **1 unit** per 50 videos.
   - **Cache Hit**: Returns songs directly from `artistCache` (0 quota).

3. **Mood/Blend Mode Songs (`GET /api/songs`)**:
   - **Trigger**: User starts playing mood/blend mode, or when the frontend's local `cachedSongsPool` is empty or has fewer than 10 songs during a refresh list fallback.
   - **API Calls**:
     - Checks the backend persistent cache (`searchCache` and `blendCache`) first.
     - **Cache Miss**: Performs a search (`GET /youtube/v3/search`) for the combined mood keywords (cost: **100 units**) and fetches video details via `/youtube/v3/videos` to score them (cost: **1 unit** per 50 videos).
   - **Cache Hit**: Returns cached scored songs (0 quota).

4. **Song Stats & Reference Check (`GET /api/song/:videoId/stats`)**:
   - **Trigger**: Called by the frontend whenever the playing song changes (auto-advance, skip, previous, or queue load on refresh).
   - **API Calls**:
     - **Optimized Cache Hit**: Checks the backend's persistent `scoredVideosCache`. If statistics exist, returns them immediately (**0 units**).
     - **Cache Miss**: Queries `GET /youtube/v3/videos` for that specific video ID (statistics and snippet). Cost: **1 unit**. The result is then cached in `scoredVideosCache` and written to `cache.json`.

5. **Auto-DJ Prefetching (`POST /api/songs/prewarm`)**:
   - **Trigger**: Frontend queue reaches 75% playback progress.
   - **API Calls**: Hits backend cache first. Falls back to YouTube Search/Video details on cache miss.

---

## 2. Firebase Firestore (Database Reads/Writes)

Firestore is billed based on Document Reads, Writes, and Deletes.

### 🛑 WHEN Firestore is CALLED:

1. **User Authentication & Onboarding Loading**:
   - **Trigger**: Page loads / User authentication state changes.
   - **API Call**: `getDoc(userRef)` reads the user's preferences, selected artists, and onboarding timestamps. Cost: **1 Read**.

2. **Daily Onboarding Confirmation (`completeOnboarding`)**:
   - **Trigger**: User confirms artist selections or skips (keeping previous artists) on the daily prompt modal.
   - **API Call**: `setDoc(userRef, { selectedArtists, lastOnboardedDate, lastOnboardedTimestamp })` updates the user's preferences. Cost: **1 Write**.

3. **Liking a Song (`POST /api/like`)**:
   - **Trigger**: User clicks the "Like" button on a playing song.
   - **API Call** (non-blocking backend execution):
     - Increments the artist's count under `users/{userId}/preferences/likedArtists` (1 Read, 1 Write).
     - Increments the extracted keywords' counts under `users/{userId}/preferences/likedKeywords` (1 Read, 1 Write).
     - Saves the liked song details under `users/{userId}/likedSongs/{videoId}` (1 Write).

4. **Disliking a Song (`POST /api/dislike`)**:
   - **Trigger**: User clicks the "Dislike" button on a playing song.
   - **API Call** (non-blocking backend execution):
     - Appends the video ID to `users/{userId}/preferences/dislikedVideos` (1 Read, 1 Write).
     - Appends the artist name to `users/{userId}/preferences/dislikedArtists` (1 Read, 1 Write).

5. **Save History (`saveHistory`)**:
   - **Trigger**: A song is played continuously for 20 seconds.
   - **API Call**: Writes the song to the `users/{userId}/history` subcollection (1 Write).

6. **Playlists CRUD Operations**:
   - **Trigger**: Creating, editing, pinning, deleting, or adding/removing songs to/from playlists.
   - **API Call**: standard document writes/updates/deletes on the `users/{userId}/playlists` subcollection.

---

## 3. Glitches Resolved & Optimizations

We implemented the following key fixes to address quota exhaustion, queue rendering glitches, and onboarding flow:

### 🔄 1. The Queue Refresh Button Glitch
* **The Issue**: Previously, clicking "Refresh" reshuffled the `moodydj_cached_pool` in local storage but failed to filter out the 50 songs already in the player queue. As a result, the "refreshed" queue had massive overlap with the current queue, making it seem like it didn't change. Additionally, starting the refreshed queue's first song triggered an uncached stats API call.
* **The Fix**: 
  - Updated `handleRefreshList` in both `App.jsx` and `SoloPage.jsx` to construct a `currentSet` of video IDs from the current queue and subtract them (along with `recentSongs` history) from the local cached pool before slicing a new batch of 50 songs.
  - Implemented persistent caching for the `/api/song/:videoId/stats` endpoint inside `scoredVideosCache` (written to `cache.json`), ensuring stats calls on song changes cost **0 units** for cached songs.

### ⏱️ 2. Dynamic 12-Hour Onboarding Prompt
* **The Issue**: When the 12-hour window since the last onboarding selection expired, the Daily Artist Selection popup would only trigger if the user reloaded the page.
* **The Fix**: Added `lastOnboardedTimestamp` state inside `ArtistContext.jsx` and set up a background interval that runs every 30 seconds. The interval checks if `Date.now() - lastOnboardedTimestamp >= 12 * 60 * 60 * 1000`. Once this condition is met, it dynamically updates `onboardingCompletedToday` to `false`, rendering the daily selection popup instantly.

### 🚫 3. YouTube Shorts (< 2 Mins) & Cover Filtering
* **The Issue**: YouTube Shorts and cover songs would slip into Solo Mode and Prewarmed Artist pools because the endpoints did not run the songs through the scoring/duration filters before cache/return. Also, rejected songs were not cached, resulting in repeated YouTube calls.
* **The Fix**:
  - In `scoreVideos`, if a video fails the duration thresholds (less than 2 minutes) or matches cover keywords without an official channel, it is cached in `scoredVideosCache` with a `rejected: true` flag. This prevents it from ever querying the YouTube API again.
  - In `toScoredQueue`, any song with `rejected: true` or a positive duration under 120 seconds is strictly discarded from the queue.
  - Updated `/prewarm-artists` and `/solo-songs` to route search and cached pools through `toScoredQueue`, completely sanitizing Solo Mode queues and the onboarding prewarmed pool of YouTube Shorts.

### 👎 4. VideoId-Centric & Artist-Aware Dislikes (No Title Keywords)
* **The Issue**: Aggressive keyword-based dislike filtering causes false positives, accidental mood suppression, and song exclusion (e.g., disliking one "sad remix" song should not suppress all "sad" songs globally).
* **The Fix**: Reverted back to the safer videoId-centric dislike model. Disliking a song removes the exact `videoId` from the active queue and bans it, and lowers playback priority for that artist/channel in future queues, without globally keyword-banning words in titles.
