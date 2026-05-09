# MoodyDJ Song Fetch Logic and Variety Upgrade Notes

## Current fetch logic in short

### Normal mood mode
- Frontend calls `GET /api/songs` from `client/src/App.jsx`.
- Backend builds a mood query from:
  - base mood keywords
  - liked keywords
  - disliked keywords
- Backend searches YouTube in `server/routes/songs.js` using multiple fixed queries like:
  - `"{query} songs"`
  - `"{query} playlist"`
  - `"{query} mix"`
  - `"{query} jukebox"`
- Results are deduplicated, filtered by duration, scored, and stored in a session queue.
- The player then uses queue + weighted random selection for next songs.

### Personalized mood mode
- Same `/api/songs` route is used.
- If personalization is enabled, search changes to artist-based queries like:
  - `"{artist} songs"`
  - `"{artist} playlist"`
- Backend distributes results across artists and then scores them.

### Solo artist mode
- Frontend calls `POST /api/solo-songs` from `client/src/pages/SoloPage.jsx`.
- Backend fetches per artist using:
  - `"{artist} songs"`
  - `"{artist} official songs"`
- Results are deduplicated, duration-filtered, quota-balanced across artists, then shuffled before returning.
- Unlike normal mode, solo mode currently returns a fresh batch directly and does not use the same session queue pipeline.

## Why the same songs keep coming

### Root causes
- YouTube search queries are very fixed, so they keep returning the same top-ranked results.
- Cache keys are too broad:
  - normal mode cache key is mostly just `mood`
  - personalized cache key is mostly just sorted artist names
- That means repeated requests often reuse the same cached candidate pool.
- Even when not served from cache, YouTube top results for the same artist/query are usually similar.
- Solo mode takes the top search results, applies quota, then shuffles only within that same small pool.
- There is no long-term memory saying: “these Arijit songs were already served yesterday, show different ones now.”

## Exact boredom problem
If you pick the same artist or same mood on different days, MoodyDJ often starts from the same top search results again. So even though shuffle changes order, the actual candidate pool is too similar, which creates boredom quickly.

## Best upgrade direction for variety

### Goal
If a user picks the same artist again later, the app should return a different batch whenever possible, not the same first 5 songs repeatedly.

### Recommended backend changes
- Add recency memory per user/session/artist:
  - store recently served `videoId`s for each artist and mood
  - exclude them for a cooldown window like 1 day, 3 days, or 7 days
- Expand search depth:
  - fetch more than only the first page of YouTube search results
  - use `nextPageToken` and build a deeper candidate pool
- Rotate query templates:
  - for artists: `songs`, `official songs`, `hits`, `album`, `live`, `playlist`, `romantic`, `sad`, `lofi`, etc.
  - for moods: rotate search patterns instead of always using the same 4
- Separate cache by rotation seed:
  - include date bucket, page token, or rotation index in cache key
  - example: `pers:arijit-singh:2026-04-23`
- Add freshness-aware filtering:
  - before final selection, remove songs recently served to that same user
- Use a larger candidate pool and pick 5-15 from it randomly after scoring

## Strongest practical fix
The best real fix is this combination:
1. Pull a bigger candidate pool for each artist/mood.
2. Store recently shown `videoId`s per user or per session family.
3. Exclude recent tracks before final selection.
4. Only fall back to old tracks if the fresh pool becomes too small.

That will give:
- Arijit today -> batch A
- Arijit tomorrow -> batch B
- Arijit again later -> batch C
- only after enough time or exhaustion should older songs reappear

## Suggested implementation plan later

### For normal mood mode
- Add a `servedHistory` store keyed by:
  - `userId + mood`
  - or `sessionId + mood`
- Before returning `/api/songs`, remove recently served videos from the candidate list.
- If the list becomes too small, pull more YouTube pages or relax the recency filter gradually.

### For personalized mode
- Track served history by:
  - `userId + artist`
  - or `userId + sorted selectedArtists`
- Cache should not be only `pers:artists`; add a rotation key or time bucket.

### For solo mode
- This is the biggest repeat hotspot.
- Add:
  - deeper pagination
  - recent-track exclusion per artist
  - date-based rotation cache key
- Because solo mode currently uses top results + shuffle, it should be upgraded first.

## Features that would make this system better next
- `Refresh mix` button to generate a different batch instantly
- `Avoid repeats for 7 days` user setting
- `More discovery / more popular / more deep cuts` slider
- Skip-based learning so skipped songs are downranked
- Artist diversity control so one artist does not dominate a mixed session
- Smart fallback tiers:
  - fresh songs first
  - semi-recent songs second
  - old familiar songs last
- User taste profile from likes, full listens, and skips

## Bottom line
Your current system already has a solid queue and scoring base, but it is not yet a true variety engine. The main reason boredom happens is not playback, but candidate generation: the app keeps starting from the same top YouTube search results and does not remember what it already served recently. The next upgrade should focus on deeper retrieval + recency filtering + rotation-aware caching.
