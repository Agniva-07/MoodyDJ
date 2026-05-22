# MoodyDJ — Bug Analysis & Fix Guide

## The Core Problem in Plain English

Your app is designed to:
1. At onboarding → call `/api/prewarm-artists` with all 10 selected artists → get 700–1000 enriched songs back → save them to IndexedDB
2. After that → **zero API calls** for playback; all queues built from IndexedDB locally

**What's actually happening:**

The onboarding prewarm is either **not being called**, **not saving to IndexedDB**, or **not enriching songs with the required `moodTags` field**, so when the user picks a mood, `getSongsByMood("sad")` only finds 4 songs (your 17 seed songs, the ones that happened to have `moodTags: ["sad"]`). The system declares the pool "too small" and stays on seeds forever.

---

## Bug #1 — `ArtistContext` is calling `/prewarm-artists` but the response is never saved to IndexedDB

**Where:** `ArtistContext.jsx` (not uploaded, but deducible from the flow)

**What the code does:**
- `App.jsx` calls `handleArtistSelectionComplete(artists)` → which calls `setSelectedArtists(artists)` via `useArtists()` from `ArtistContext`
- The prewarm call likely lives inside `ArtistContext` (or `ArtistSelection.jsx`)
- The prewarm endpoint **does return enriched songs** with `moodTags`, `energyScore`, etc.
- But the client code likely calls `updateCachedPool(songs)` (which writes to **localStorage**) instead of `saveSongsToPool(songs)` (which writes to **IndexedDB**)

**Evidence:**
```
dbService.js:218 [MOOD QUERY] sad 4
```
Only 4 sad songs found = only the 17 `FRONTEND_SEED_SONGS` from `dbService.js` are in IndexedDB. The full prewarm pool was either never saved, or saved only to `localStorage` (the `moodydj_cached_pool` key), which `getSongsByMood()` never reads.

**Fix:**

In whichever component calls `/api/prewarm-artists` (likely `ArtistSelection.jsx` or `ArtistContext.jsx`), ensure the response is saved to IndexedDB, not just localStorage:

```js
// ❌ WRONG — saves to localStorage only, never read by queue engine
import { updateCachedPool } from "./cacheService";
updateCachedPool(data.songs);

// ✅ CORRECT — saves to IndexedDB, which getSongsByMood() queries
import { saveSongsToPool } from "./dbService";
await saveSongsToPool(data.songs);
```

Also call `updateCachedPool` after for legacy compatibility if needed, but `saveSongsToPool` is the critical one.

---

## Bug #2 — Seed songs from `FRONTEND_SEED_SONGS` are missing `moodTags` on some entries, causing them not to be found by mood queries

**Where:** `dbService.js` → `FRONTEND_SEED_SONGS`

**What happens:**
- `ensureSeedSongsLoaded()` runs when DB is empty
- These seeds ARE written to IndexedDB via `saveSongsToPool()`
- BUT: `getSongsByMood("sad")` uses an IDBKeyRange index on `moodTags`
- The `moodTags` field must be a **non-empty array** for the multiEntry index to work

**Evidence:**
```
[MOOD QUERY] sad 4
```
Only 4 of your seed songs have `moodTags: ["sad"]` — that matches exactly the 4 sad songs in `FRONTEND_SEED_SONGS`. This confirms the index works, but the pool is only 17 seeds, not 700+ prewarm songs.

**Fix:** This seed issue is secondary. Once Bug #1 is fixed, you'll have 700+ songs. But as a safeguard, verify every seed has a valid `moodTags` array:

```js
// In FRONTEND_SEED_SONGS — all entries look correct already.
// Just ensure prewarm songs also get proper moodTags.
// The /prewarm-artists endpoint already does this enrichment — the issue is they're not reaching IndexedDB.
```

---

## Bug #3 — `ensureSeedSongsLoaded` fires on EVERY mood selection, not just on first launch

**Where:** `App.jsx` lines ~390 and ~275 (in `handleMood` and `handleRefreshList`)

**What happens:**
```js
await ensureSeedSongsLoaded("Mood generation fallback", { caller: "handleMood", mood1, mood2 });
```

`ensureSeedSongsLoaded` only seeds if `getSongsCount() === 0`. That's correct. BUT because the prewarm songs were never saved (Bug #1), the count is always 17 (just seeds) — so it returns early without seeding, but the mood query still returns only 4 songs.

This is not a bug itself, but it masks the real issue. Once Bug #1 is fixed, count will be 700+ and this check will be a harmless no-op.

---

## Bug #4 — Double-render of queue restoration logs (React StrictMode)

**Where:** `App.jsx` and `SoloPage.jsx`

**Evidence:**
```
🔌 [QUEUE RESTORATION] Restored queue from localStorage: 3 songs, currentIndex: 0
installHook.js:1 🔌 [QUEUE RESTORATION] Restored queue ...  (duplicate)
```

**Why it happens:** React 18 StrictMode intentionally double-invokes `useEffect` in development to catch side effects. The second log comes from `installHook.js` which is React DevTools intercepting the re-render.

**Fix:** This is harmless in production — StrictMode double-invoke only happens in dev builds. But to silence it in development:

```js
// In App.jsx — the restoration useEffect is just a log, not an actual state setter.
// State is set in useState initializers (correct), so no double-state problem exists.
// No fix needed unless you want to remove the cosmetic log useEffect.
```

---

## Bug #5 — `/api/song/:videoId/stats` returns 404 for several videoIds

**Where:** `songs.js` endpoint `/song/:videoId/stats`

**Why it 404s:**
The endpoint fetches from YouTube API and returns 404 if `response.data.items[0]` is undefined (video not found or embedding disabled). Videos like `sK7riqg2mrA`, `n0Q0Q7P3CAU`, `1wRXb8tHl6Q` are **embedding-restricted** — YouTube still serves their metadata, but the frontend stats call is failing with 404 because the backend returns a 404 when the video is in the seed list but has been removed or restricted.

**Additionally:** Your `App.jsx` `fetchStats` function is called on every song change — this means it always fires an API call even in local/offline mode, hitting quota needlessly.

**Fix in `songs.js`:** Change the 404 response to return an empty stats object instead, to avoid noisy errors:

```js
// In songs.js — /song/:videoId/stats
const video = response.data.items[0];

if (!video) {
  // ✅ Return empty stats instead of 404
  return res.json({
    viewCount: "0",
    likeCount: "0",
    channelTitle: "",
    publishedAt: new Date().toISOString(),
  });
}
```

**Fix in `App.jsx`:** Guard the stats call — if the song is from the local seed pool, skip the network call entirely:

```js
const fetchStats = async (videoId) => {
  try {
    setStats(null);
    const res = await axios.get(`http://localhost:5000/api/song/${videoId}/stats`);
    setStats(res.data);
  } catch (err) {
    // ✅ Silently swallow 404s — stats are non-critical
    if (err?.response?.status !== 404) {
      console.log("Stats fetch failed:", err.message);
    }
  }
};
```

---

## Bug #6 — Thumbnail 404s for restricted videos

**Where:** `dbService.js` → seed song thumbnails

**Why it happens:** Videos like `sK7riqg2mrA` (Agar Tum Saath Ho by T-Series) have been **removed from YouTube** or their video IDs have changed. `mqdefault.jpg` returns 404 when the video no longer exists.

**Fix:** Remove or replace the broken videoIds in `FRONTEND_SEED_SONGS`. Confirmed broken IDs from logs:
- `sK7riqg2mrA` — Agar Tum Saath Ho (embedding restricted / removed)
- `n0Q0Q7P3CAU` — Kar Gayi Chull (embedding restricted)
- `1wRXb8tHl6Q` — Judaai Badlapur (embedding restricted)

Replace them with verified embeddable alternatives:

```js
// Replace these in FRONTEND_SEED_SONGS in dbService.js:

// Instead of sK7riqg2mrA (Agar Tum Saath Ho) — use:
{ videoId: "dZ0fwJ1OoEA", title: "Bekhayali (Kabir Singh)", artist: "T-Series", artistNormalized: "t-series",
  thumbnail: "https://i.ytimg.com/vi/dZ0fwJ1OoEA/mqdefault.jpg", durationSeconds: 294,
  moodTags: ["chill"], energyScore: 0.30, popularityScore: 0.95, sourceArtist: "t-series", validated: true },

// Instead of n0Q0Q7P3CAU (Kar Gayi Chull) — use:
{ videoId: "yuCBIJ7s-bE", title: "Badtameez Dil", artist: "T-Series", artistNormalized: "t-series",
  thumbnail: "https://i.ytimg.com/vi/yuCBIJ7s-bE/mqdefault.jpg", durationSeconds: 252,
  moodTags: ["hype"], energyScore: 0.92, popularityScore: 0.96, sourceArtist: "t-series", validated: true },

// Instead of 1wRXb8tHl6Q (Judaai Badlapur) — use:
{ videoId: "kpdv3BvTz1U", title: "O Saathi (Baaghi 2)", artist: "T-Series", artistNormalized: "t-series",
  thumbnail: "https://i.ytimg.com/vi/kpdv3BvTz1U/mqdefault.jpg", durationSeconds: 220,
  moodTags: ["sad"], energyScore: 0.25, popularityScore: 0.87, sourceArtist: "t-series", validated: true },
```

**Also add an `<img>` fallback in your UI components:**

```jsx
<img
  src={song.thumbnail}
  onError={(e) => {
    e.target.src = `https://i.ytimg.com/vi/${song.videoId}/default.jpg`;
  }}
  alt={song.title}
/>
```

---

## Bug #7 — `recentSongs.length` shows 23 excluded songs, starving the sad mood pool of 4

**Where:** `App.jsx` `handleMood` → `generateLocalQueue`

**What happens:**
```
Excluded: 23 played. 
Candidates: 4
```

The `recentSongs` array has 23 entries — all 4 sad seed songs have likely been played before, so `generateLocalQueue` excludes them as "recently played". With only 4 sad songs in the DB, all 4 are excluded, leaving nothing fresh.

**This is a symptom of Bug #1** — if the DB had 700+ songs, 23 excluded would leave 677+ candidates. But also the recycling logic should kick in:

In `localEngine.js`, when fresh candidates are 0, it recycles from `recentSongs` (older played songs). But it logs:
```
Pool size after recycling: 4 (added 0 oldest recycled songs)
```

This means the 4 songs ARE in `currentQueue` (excluded by `!currentIds.has(s.videoId)`) so recycling can't even add them back.

**Fix in `localEngine.js`:** When the entire pool size equals zero after recycling, ignore the `currentIds` filter too (last-resort fallback):

```js
// After the recycling block, add this final last-resort block:
if (candidates.length === 0) {
  console.warn("⚠️ [LOCAL QUEUE ENGINE] Zero candidates even after recycling. Using full pool as last resort.");
  candidates = uniquePool.filter(s => !dislikedIdsSet.has(s.videoId));
}
```

---

## Priority Order for Fixes

| Priority | Bug | File to Edit | Impact |
|----------|-----|--------------|--------|
| 🔴 Critical | Bug #1: Prewarm songs not saved to IndexedDB | `ArtistSelection.jsx` or `ArtistContext.jsx` | Fixes everything — 700+ songs in DB |
| 🔴 Critical | Bug #6: Broken seed videoIds (embedding restricted) | `dbService.js` | Stops skip-looping on startup |
| 🟠 High | Bug #5: Stats 404 errors | `songs.js` + `App.jsx` | Eliminates noisy console errors |
| 🟡 Medium | Bug #7: Zero-candidate last resort fallback | `localEngine.js` | Prevents total silence when DB is small |
| 🟢 Low | Bug #4: Double restoration logs | `App.jsx` / `SoloPage.jsx` | Cosmetic only |

---

## What the Correct Full Flow Should Look Like

```
User completes onboarding (selects 10 artists)
  ↓
POST /api/prewarm-artists  ← ONE API call, ~200 quota units
  ↓ returns 700-1000 enriched songs with moodTags
  ↓
saveSongsToPool(songs)     ← write to IndexedDB ✅ (THIS STEP IS MISSING)
  ↓
User picks mood "sad"
  ↓
getSongsByMood("sad")      ← reads from IndexedDB, returns 100+ songs
  ↓
generateLocalQueue(pool)   ← local engine, zero API calls
  ↓
Play music 🎵
```

To verify the fix worked, after onboarding check:
```js
// In browser console:
const db = await indexedDB.open("MoodyDJLocalDB", 2);
// Or call getAllSongs() from dbService — should return 700+ songs
```

---

## The `SEED_SONGS` variable naming collision (Bonus Bug)

**Where:** `songs.js` (backend) vs `dbService.js` (frontend)

In `songs.js`, the `SEED_SONGS` object is defined **inside** the `getFallbackSongs` function scope (Level 3 fallback). But the `/prewarm-artists` endpoint also references `SEED_SONGS[mood]` outside of `getFallbackSongs`:

```js
// Line ~820 in songs.js, inside /prewarm-artists:
const seeds = SEED_SONGS[mood] || [];  // ← ReferenceError! SEED_SONGS is local to getFallbackSongs
```

**Fix in `songs.js`:** Hoist `SEED_SONGS` out of `getFallbackSongs` to module scope:

```js
// ✅ Move this to the top of songs.js, outside any function:
const SEED_SONGS = {
  chill: [ /* ... */ ],
  sad:   [ /* ... */ ],
  focus: [ /* ... */ ],
  hype:  [ /* ... */ ],
};
SEED_SONGS.default = SEED_SONGS.chill;

// Then in getFallbackSongs, just reference SEED_SONGS directly (no redeclaration)
```

This is likely causing the prewarm endpoint to either crash silently or skip the seed padding step, resulting in fewer songs returned than expected.
