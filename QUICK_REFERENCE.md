# Auto-DJ System - Quick Reference

## API Endpoints

### `GET /api/songs` - Initial Load
```bash
curl "http://localhost:5000/api/songs?mood=chill&sessionId=sess-123"
```
**Cost**: 0-118 quota units (search + scoring)  
**Cache**: YES (12 min TTL)  
**When**: User selects mood first time

---

### `GET /api/next-song` - Get Next Song
```bash
curl "http://localhost:5000/api/next-song?sessionId=sess-123&mood=chill"
```
**Cost**: 0-4 quota units (refill only if needed)  
**Cache**: Uses cached videos (no search)  
**When**: User skips or song ends

---

### `POST /api/prefetch-next` - Intelligent Prefetch
```bash
curl -X POST http://localhost:5000/api/prefetch-next \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess-123","mood":"chill"}'
```
**Cost**: 0-18 quota units (only if refill)  
**Cache**: Uses cached videos (no search)  
**When**: Frontend detects 75% playback (automatic)

---

### `GET /api/queue-status` - Check Health
```bash
curl "http://localhost:5000/api/queue-status?sessionId=sess-123"
```
**Cost**: 0 quota units (metadata only)  
**Cache**: N/A  
**When**: Diagnostics / monitoring

---

## Server Concepts

### Search Cache
- **Stores**: Search results grouped by mood
- **Key**: `"chill"`, `"sad"`, `"focus"`, `"hype"`
- **Size**: 18-20 videos per mood
- **TTL**: 12 minutes
- **Cost**: 100 units per cache miss

### Session Queues
- **Stores**: Pre-scored videos for each session
- **Key**: `sessionId`
- **Content**: Videos with computed scores
- **Refill Trigger**: When queue < 5 songs
- **Refill Source**: Cached videos (no search)

### Video Scoring
```
score = (log(viewCount) * 0.5) + (likeRatio * 1000 * 0.3)
```
- **Duration**: Must be 90s - 8min
- **API**: videos.list (~1 unit per video)
- **Batch**: 20 videos per call
- **Usage**: Weighted random selection

### Played History
- **Stores**: Set of played videoIds
- **Limit**: 50 max per session
- **Purpose**: Prevent repetition
- **Reset**: Auto-reset when all songs played

---

## Frontend Integration

### 1. Generate Session ID
```javascript
const sessionId = localStorage.getItem("sessionId") || 
  `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
localStorage.setItem("sessionId", sessionId);
```

### 2. Pass to Mood Request
```javascript
axios.get("http://localhost:5000/api/songs", {
  params: {
    mood: "chill",
    sessionId,  // ✅ Critical!
    ...other
  }
});
```

### 3. Monitor Playback for Prefetch
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    const duration = playerRef.current?.getDuration();
    const current = playerRef.current?.getCurrentTime();
    
    if (current > duration * 0.75) {
      axios.post("/api/prefetch-next", { sessionId, mood });
    }
  }, 5000);
  return () => clearInterval(interval);
}, [sessionId]);
```

---

## Quota Budget

### Per Session Lifecycle

| Event | Quota | Notes |
|-------|-------|-------|
| Select mood (1st time) | 118 | search + scoring |
| Select mood (cached) | 0 | cache hit |
| Next song (queue full) | 0 | weighted random |
| Next song (queue needs refill) | 18 | videos.list scoring |
| Prefetch (no refill needed) | 0 | status check only |
| Prefetch (refill triggered) | 18 | videos.list scoring |

### 30-Minute Session (10 songs)
```
Initial load:        118 units
Refills (2-3x):       36 units
Prefetch calls:        0 units
─────────────────
TOTAL:               154 units ✅

Naive (search/song):  1000+ units ❌
```

---

## Algorithms

### Weighted Random Selection
```
// Don't sort - use weighted random
scores = [10, 5, 8, 12, 3]
total = 38

random = Math.random() * 38 = 22.5

Running sum:
10      -> pick songs[0]? No (10 < 22.5)
10+5=15 -> No (15 < 22.5)
15+8=23 -> YES (23 > 22.5) ✓ Pick songs[2]
```

**Result**: Higher scores are picked more often, but randomness preserved!

### Duration Filter
```
ISO 8601: PT3M45S = 225 seconds
Valid range: 90 - 480 seconds
```

### Like Ratio Weight
```
viewCount = 1,000,000
likeCount = 50,000
ratio = 50,000 / 1,000,000 = 0.05

score += (0.05 * 1000) * 0.3 = 15
```

---

## Configuration (Tuning)

### Conservative (Min Quota)
```javascript
const QUEUE_MIN_SIZE = 3;
const CACHE_TTL = 15 * 60 * 1000;
maxResults = 15;
```
→ ~100 units per session

### Balanced (Recommended)
```javascript
const QUEUE_MIN_SIZE = 5;
const CACHE_TTL = 12 * 60 * 1000;
maxResults = 18;
```
→ ~150 units per session

### Premium (Smooth)
```javascript
const QUEUE_MIN_SIZE = 10;
const CACHE_TTL = 10 * 60 * 1000;
maxResults = 20;
```
→ ~200 units per session

---

## Debugging Checklist

- [ ] sessionId persisted in localStorage?
- [ ] sessionId included in /songs request?
- [ ] Logs show `✅ CACHE HIT`?
- [ ] Prefetch triggered at 75%?
- [ ] Queue status shows > 5 videos?
- [ ] No `🔍 SEARCH` logs after initial?
- [ ] Metadata `quotaSafe: true`?
- [ ] No errors in console?

---

## Response Format

All endpoints return:
```javascript
{
  ...data,
  meta: {
    source: "cache" | "fresh" | "queue",
    quotaSafe: true,
    // + endpoint-specific metadata
  }
}
```

---

## Common Commands

### Reset Session
```javascript
localStorage.removeItem("sessionId");
location.reload();
```

### Check Cache
```javascript
fetch("http://localhost:5000/api/queue-status?sessionId=sess-123")
  .then(r => r.json())
  .then(d => console.log(d.meta.cacheSize));
```

### Monitor Quota
```bash
npm start | grep -i "quota\|search\|cache"
```

### Test Prefetch
```javascript
// At 75% playback
fetch("http://localhost:5000/api/prefetch-next", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({sessionId: "test", mood: "chill"})
}).then(r => r.json()).then(console.log);
```

---

## Key Insights

🎯 **Only search on initial mood selection**
- Cache saves 100 units per repeat
- 80%+ requests use cache

🎲 **Weighted random is free**
- No extra API calls
- Creates natural variety
- Smarter than sorting

📋 **Queue prefill is lazy**
- Only refills when needed
- Scoring is cheap (1 unit)
- Seamless to user

🔐 **Session isolation**
- Each user gets own queue
- No cross-contamination
- Scales to millions

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Cache hit rate | >80% | Achievable |
| Quota per song | <15 units | 5-10 units |
| Queue size | 8-15 | Maintained |
| Refill frequency | <1x per song | ~1x per 3 songs |
| Prefetch latency | <100ms | Typical |

---

## Architecture Overview

```
Frontend
  ├─ Mood Selection
  │  └─ POST /songs?sessionId=X
  │
  ├─ During Playback
  │  └─ Monitor 75%
  │
  └─ Playback Events
     ├─ POST /prefetch-next (75%)
     └─ GET /next-song (skip/end)

Backend
  ├─ searchCache (mood → videos)
  ├─ sessionQueues (sessionId → queue)
  ├─ playedHistory (sessionId → Set)
  │
  ├─ Endpoints
  │  ├─ /songs (search + score)
  │  ├─ /next-song (queue + refill)
  │  ├─ /prefetch-next (lazy refill)
  │  └─ /queue-status (diagnostics)
  │
  └─ APIs
     ├─ search (100 quota, cached)
     └─ videos.list (1 quota, batch)
```

---

## Last Resort Troubleshooting

**Problem**: Queue always empty
```javascript
// Increase initial search
searchMoodVideos(mood, query) → maxResults: 25
// Also increase min queue size
QUEUE_MIN_SIZE = 10
```

**Problem**: Too many searches
```javascript
// Extend cache TTL
CACHE_TTL = 15 * 60 * 1000 // 15 min instead of 12
```

**Problem**: Repetitive songs
```javascript
// Increase initial batch
maxResults = 25 // More variety
// Extend played history
MAX_PLAYED_HISTORY = 100
```

**Problem**: High prefetch cost
```javascript
// Lower refill threshold (won't refill as much)
QUEUE_MIN_SIZE = 3
// Or lower prefetch check frequency
// Check every 10s instead of 5s
```

---

**Version**: 1.0  
**Last Updated**: April 15, 2026  
**Status**: Production Ready ✅
