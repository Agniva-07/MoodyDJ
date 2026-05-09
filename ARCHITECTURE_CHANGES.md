# Architecture Changes: Quota Optimization (Phases 1 & 2)

## 1. What Phase 1 Added
Phase 1 focused on optimizing Solo Mode through a daily prewarming pattern and client-side prompt to save thousands of API units previously burned on duplicate queries.
- **Frontend `DailyArtistPrompt.jsx`**: A glassmorphic React modal asking users for up to 10 artists on their first session of the day (tracked via `localStorage`).
- **`artistCache` Map**: A server-side map in `songs.js` retaining cached fetched items with a 24-hour TTL and localized read offsets.
- **`POST /api/prewarm-artists` Endpoint**: Issues two optimized combined YouTube Search calls per artist (`"popular songs official"` & `"best hits playlist"`) storing up to 75 songs in memory.
- **Optimized `POST /api/solo-songs`**: Now grabs exactly 15 pre-shuffled tracks directly from the `artistCache` using a persistent per-artist `offset` that advances/wraps with each session request, producing zero-cost solo queues.

## 2. What Phase 2 Added
Phase 2 implemented a hardened safety net to absolutely guarantee the app will never crash or break API caps by meticulously tracking quota in real-time and gracefully transitioning to multi-tiered fallbacks.
- **`quotaTracker` Object**: In-memory state tracking `{ unitsUsed, resetTime }`.
- **`getNextMidnightPT()`**: Helper calculating the dynamic UTC timestamp for the next Pacific Time midnight (YouTube's quota reset boundary).
- **`trackQuotaUsage(units)`**: Helper logging and bumping the local tally whenever an API call completes successfully.
- **`isQuotaSafe(units)`**: Helper checking if `unitsUsed + units <= 8500`.
- **`getFallbackSongs(type, query, userId)`**: The core fallback orchestrator containing 3 tiered fallback mechanisms:
  - *Level 1 (Cache)*: Pulls relevant queries natively mapped inside `artistCache` completely offline.
  - *Level 2 (Firestore History)*: Checks user's personal previously cached `recentSongs` in Firestore and shuffles them.
  - *Level 3 (Seed Array)*: Constant mapping `SEED_SONGS` equipped with 15 hardcoded, actively validated YouTube videoIds tailored directly per mood (`chill`, `sad`, `focus`, `hype`).
- **Quota Error Handling (`QuotaSafeFallback`)**: Modified `fetchSearchPages` to aggressively throw a custom wrapper error upon quota unsafe violations.
- **`GET /api/quota-status` Endpoint**: Monitors current API costs remotely via Node.
- **Midnight Reset Interval**: A background `setInterval` polling every 60 seconds resetting `unitsUsed` natively at Pacific Midnight.

## 3. Updated API Call Flow
```text
[User Action] --> [Endpoint]
       |
       v
[Quota Safe Check (`isQuotaSafe(100)`)] 
       |
       +--> (If Unsafe) --> `getFallbackSongs()`
       |                        |--> Level 1: Check `artistCache`
       |                        |--> Level 2: Fetch from Firestore `recentSongs`
       |                        \--> Level 3: Return hardcoded `SEED_SONGS`
       |
       +--> (If Safe) ----> Make YouTube Search Request (`axios.get`)
                                |
                                \--> `trackQuotaUsage(100)`
                                |
[Return Results (Fresh OR Fallback)]
```

## 4. Current Quota Cost Breakdown
* **Prewarm Session (`/prewarm-artists`)**: 
  * **200 units** per artist (2 `search.list` queries). Paid exactly ONCE daily per artist.
* **Solo Mode (`/solo-songs`)**: 
  * **0 units** if the artist was prewarmed (Cache Hit). 
  * **100 units** if NOT prewarmed (1 `search.list` fallback).
* **Mood Blend Mode (`/songs`)**: 
  * **0 units** if querying a recently searched generic mood (12-minute TTL Cache Hit). 
  * **100 units** per un-cached mood.
* **Metadata/Scoring Pipeline (`/song/:videoId/stats`)**:
  * **1 unit** per `videos.list` metric request (Extremely cheap).
* **Safe Quota Mode (Exhausted)**:
  * **0 units** globally regardless of requested mode/artists. Falls back flawlessly to DB/Cache/Seeds.

## 5. Files Modified

### `client/src/App.jsx`
- Added the global `<DailyArtistPrompt />` injection in the primary app entry router to prompt users on their first daily session.

### `client/src/components/DailyArtistPrompt.jsx` & `.css`
- Entirely new component allowing users to pre-pick 10 artists with interactive state to send to `/api/prewarm-artists`.

### `server/routes/songs.js`
- **Added**: `quotaTracker`, midnight reset helpers, `getFallbackSongs` function logic, `SEED_SONGS` constants, `artistCache` instantiations.
- **Rewritten**: `fetchSearchPages` to check `isQuotaSafe()` prior to requests, and `/solo-songs` completely restructured around paginated cache routing + fallback catching.
- **Wrapped**: Existing endpoints like `/songs` and `/prewarm-artists` with the global `catch(error.name === "QuotaSafeFallback")` pattern to seamlessly intercept unsafe quota bounds and return functional UI payloads.

### `server/index.js`
- **Added**: `GET /api/quota-status` routing endpoints returning live status readouts.
- **Added**: Top-level Node `setInterval` executing every 60 seconds asserting backend midnight boundaries seamlessly without requiring cron tasks.
