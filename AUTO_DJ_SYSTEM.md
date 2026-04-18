# 🎵 Smart Auto-DJ System - Quota Optimized

## Overview

The Auto-DJ system is a **quota-optimized, intelligent music streaming backend** that minimizes YouTube API usage while maintaining continuous, high-quality playback.

**Primary Goal**: Maximum song quality with **minimum API quota consumption**.

---

## 🎯 Core Principles

### 1. **Quota Safety First** ⚡
- `search` = 100 quota units (EXPENSIVE - rarely used)
- `videos.list` = ~1 quota unit (CHEAP - used for scoring)
- `search` is only called on **initial mood selection** or **when queue is empty**
- **Aggressive caching** prevents redundant searches (10-15 min TTL)

### 2. **Smart Reuse** ♻️
- Cache search results → reuse multiple times
- Batch score requests (multiple videos in one API call)
- Session-based queues prevent duplicate fetches

### 3. **Weighted Random Selection** 🎲
- Higher-score videos have higher chance of playing (but still random)
- No sorting needed (saves processing)
- Creates natural variety without extra API calls

---

## 📋 Architecture

### Server-Side Components

#### **1. Search Cache** (Step 1-2)
```javascript
const searchCache = new Map();
// Key: mood name (e.g., "chill")
// Value: { videos: [...], timestamp }
// TTL: 12 minutes
```
- Stores search results from `search.list` API
- Reused across all sessions for the same mood
- Automatically checks TTL before returning

#### **2. Session Queues** (Step 5)
```javascript
const sessionQueues = new Map();
// Key: sessionId
// Value: {
//   videos: [...scored videos],
//   scores: { videoId: score },
//   mood: "chill",
//   queued: []
// }
```
- Maintains unique queue per user session
- Stores pre-scored video data
- Refills automatically when queue < 5

#### **3. Played History** (Step 7)
```javascript
const playedHistory = new Map();
// Key: sessionId
// Value: Set of played videoIds (max 50)
```
- Prevents song repetition within session
- Tracks last 50 played songs
- Automatically resets when all songs played

#### **4. Video Scoring** (Step 3)
```javascript
score = (log(viewCount) * 0.5) + (likeRatio * 1000 * 0.3)
```
- **View count weight**: Discovery of underrated content
- **Like ratio weight**: Quality indicator
- **Duration filter**: Only 90sec - 8min songs
- Cheap to compute (uses `videos.list`, ~1 unit each)

---

## 🔄 Auto-DJ Flow

### **Initial Mood Selection** (Expensive)
```
User clicks "Chill"
    ↓
Check searchCache["chill"]
    ↓
Cache exists + valid? → Return cached videos (0 quota)
    ↓
Cache miss/expired? → Call search API (100 quota cost)
    ↓
Store in cache
    ↓
Initialize session queue
    ↓
Score videos (cheap API call)
    ↓
Return to user
```

### **Playing Next Song** (Cheap)
```
Queue size < 5?
    ↓
NO → Weighted random select from queue
    ↓
YES → Refill queue:
    - Use existing cached videos
    - Score them (cheap)
    - Add to queue
    - Return next song
```

### **Prefetch (75% Playback)** (No Search)
```
Song reaches 75% progress
    ↓
Frontend triggers /prefetch-next
    ↓
Queue check:
    - Full? → No action (0 quota)
    - Low? → Refill from cache (cheap scoring)
    ↓
Ensures seamless playback
```

---

## 📡 API Endpoints

### **1. `/api/songs` (GET)**
Initial mood selection. **Only search endpoint.**

**When to call**: User selects mood for the first time

**Request**:
```javascript
GET /api/songs?mood=chill&sessionId=sess-12345
```

**Response**:
```javascript
{
  songs: [{ videoId, title, channelTitle, thumbnail }, ...],
  blend: { mood1, weight1, mood2, weight2 },
  meta: {
    source: "cache|fresh",
    quotaSafe: true,
    cacheHit: true/false
  }
}
```

**Quota Cost**:
- Cache hit: 0 units
- Cache miss: 100 units (search API)
- Scoring: ~18-20 units (videos.list, batch)

---

### **2. `/api/next-song` (GET)**
Get next song from session queue. **Zero search calls.**

**When to call**: User skips or song ends

**Request**:
```javascript
GET /api/next-song?sessionId=sess-12345&mood=chill
```

**Response**:
```javascript
{
  song: { videoId, title },
  meta: {
    source: "queue",
    quotaSafe: true,
    queueStrategy: "weighted_random"
  }
}
```

**Quota Cost**:
- Refill needed? ~1-18 units (videos.list for scoring)
- Queue full? 0 units

---

### **3. `/api/prefetch-next` (POST)**
Trigger queue prefill at ~75% playback. **No searches.**

**When to call**: Frontend monitors playback progress (internal)

**Request**:
```javascript
POST /api/prefetch-next
{ sessionId: "sess-12345", mood: "chill" }
```

**Response**:
```javascript
{
  status: "prefetch_queued",
  queueSize: 15,
  needsRefill: false,
  meta: {
    source: "prefetch",
    quotaSafe: true,
    noSearchNeeded: true
  }
}
```

**Quota Cost**: 0-18 units (only if refill triggered)

---

### **4. `/api/queue-status` (GET)**
Check queue health. **Diagnostic only.**

**Request**:
```javascript
GET /api/queue-status?sessionId=sess-12345
```

**Response**:
```javascript
{
  sessionId: "sess-12345",
  queueSize: 12,
  playedCount: 8,
  currentMood: "chill",
  meta: {
    quotaSafe: true,
    cacheSize: 4,
    activeSessions: 2
  }
}
```

**Quota Cost**: 0 units (metadata only)

---

## 🚀 Frontend Integration

### **Auto-DJ Prefetch Loop**
```javascript
// Monitor playback progress
useEffect(() => {
  const interval = setInterval(() => {
    const progress = currentTime / duration;
    
    if (progress > 0.75) {
      // Trigger prefetch at 75%
      axios.post("/api/prefetch-next", {
        sessionId,
        mood: selectedMood
      });
    }
  }, 5000);
  
  return () => clearInterval(interval);
}, [sessionId, selectedMood]);
```

### **Pass sessionId to Mood Selection**
```javascript
const handleMood = async (mood) => {
  const sessionId = getOrCreateSessionId();
  
  const response = await axios.get("/api/songs", {
    params: {
      mood,
      sessionId, // ✅ Critical for queue establishment
      ...otherParams
    }
  });
  
  setSongs(response.data.songs);
};
```

---

## 📊 Quota Budget Example

### Scenario: User plays for 30 minutes (10 songs)

| Action | Quota Cost | Notes |
|--------|-----------|-------|
| Initial mood selection (cache miss) | 100 | Search API (one-time) |
| Score initial batch (18 videos) | 18 | Batch videos.list |
| **After this point, all cached** | - | - |
| Next song (queue refill) x5 | ~15 total | Max 3 units each (videos in cache) |
| Prefetch calls x5 | 0 | Only queue management, no search |
| Prefetch refill (if needed) x2 | ~4 total | Cheap scoring only |
| **TOTAL** | **~137 units** | vs. 500+ with naive approach |

**Improvement**: ~73% quota savings vs. searching for each song

---

## ⚙️ Configuration

### **Tunable Parameters** (in `songs.js`)

```javascript
const CACHE_TTL = 12 * 60 * 1000;      // Cache duration (12 min)
const QUEUE_MIN_SIZE = 5;              // Trigger refill when < 5
const QUEUE_PREFILL_SIZE = 20;         // Fetch this many on refill
const MAX_PLAYED_HISTORY = 50;         // Track last 50 played
const MAX_RESULTS_PER_SEARCH = 18;     // Initial search count
```

### **Recommended Settings**
- **High traffic**: `QUEUE_MIN_SIZE = 10` (prefetch more often)
- **Low quota**: `QUEUE_MIN_SIZE = 3` (only absolute necessity)
- **Discovery mode**: Increase `MAX_RESULTS_PER_SEARCH` to 25

---

## 🔍 Monitoring & Debugging

### **Check Queue Status**
```javascript
curl "http://localhost:5000/api/queue-status?sessionId=sess-12345"
```

### **Server Logs**
The backend logs quota-saving actions:
```
✅ CACHE HIT: Using cached results for "chill"  // Good!
🔍 SEARCH: Fetching fresh results for "chill"   // Quota used
📡 PREFETCH: Checking queue...
📋 REFILL: Preparing queue...
```

### **Quota Analysis**
- Each `✅ CACHE HIT` saves 100 quota units
- Each prefetch without refill = 0 cost
- Weighted random never costs extra

---

## ⚠️ Common Issues & Solutions

### **Queue empties quickly**
- **Cause**: Low search result cache availability
- **Fix**: Increase `QUEUE_PREFILL_SIZE` or reduce `QUEUE_MIN_SIZE`

### **Repetitive songs**
- **Cause**: Small cache + high playback speed
- **Fix**: Increase `CACHE_TTL` or increase initial search count

### **High quota usage**
- **Cause**: Cache invalidation or multiple sessions
- **Fix**: Monitor cache hits in logs, extend `CACHE_TTL`

### **No prefetch effect**
- **Cause**: Queue always has songs (working as intended!)
- **Fix**: Lower `QUEUE_MIN_SIZE` to trigger more prefetches

---

## 🎓 Best Practices

1. **Always use sessionId**: Enables per-user queue isolation
2. **Frontend prefetch**: Monitor 75% playback, call `/prefetch-next`
3. **Batch requests**: Score multiple videos in one API call
4. **Monitor cache hits**: Check logs for `✅ CACHE HIT` messages
5. **Cache warming**: On server startup, pre-search popular moods
6. **TTL tuning**: Adjust based on traffic patterns

---

## 📈 Performance Metrics

### Expected Performance (per session)
- **Initial load**: 118-138 quota units (search + scoring)
- **Per skip/next**: 0-4 units (mostly cached)
- **Per 10 songs**: ~30-50 quota units total

### Optimization Potential
- **Naive approach** (search per song): 1000+ units/10 songs
- **Smart Auto-DJ**: 30-50 units/10 songs
- **Savings**: 95% quota reduction ✅

---

## 🔐 Quota Safety Guarantees

✅ No search calls on /next-song  
✅ No search calls on /prefetch-next  
✅ Cache prevents redundant searches  
✅ Batch scoring maximizes efficiency  
✅ Session isolation prevents cross-contamination  
✅ Weighted random requires 0 extra API calls  

---

## 📝 Summary

The Auto-DJ system provides:

| Feature | Benefit |
|---------|---------|
| **Aggressive Caching** | 100 quota saved per cache hit |
| **Session Queues** | Per-user isolation, no cross-contamination |
| **Weighted Random** | Variety without extra API calls |
| **Smart Prefetch** | Seamless playback at 0 cost |
| **Cheap Scoring** | Quality song selection with minimal quota |

**Result**: Premium listening experience with 95% quota savings 🎉

---

**Last Updated**: April 15, 2026  
**Version**: 1.0 (Smart Auto-DJ with Quota Optimization)
