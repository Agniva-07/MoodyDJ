# 🎵 MoodyDJ API Reference - Complete Endpoints

## Base URL
```
http://localhost:5000/api
```

---

## 📋 Quick Reference

| Method | Endpoint | Purpose | Quota Impact |
|--------|----------|---------|-------------|
| GET | `/songs` | Get initial songs for mood | 100 (cached) |
| GET | `/next-song` | Get next song from queue | 0 (from cache) |
| POST | `/prefetch-next` | Prefetch next song | 0 (from cache) |
| GET | `/queue-status` | Check queue status | 0 |
| POST | `/like` | Like video, bias future selections | 0 |
| POST | `/dislike` | Dislike video, remove similar | 0 |
| GET | `/session-preferences` | Get user preferences | 0 |
| POST | `/reset-preferences` | Clear learned preferences | 0 |
| GET | `/song/:videoId/stats` | Get video stats | 1 |
| POST | `/recent` | Add to recent history | 0 |
| GET | `/recent` | Get recent songs | 0 |

---

## 🎵 ENDPOINT 1: Get Songs for Mood

### Request
```http
GET /api/songs?mood=chill&sessionId=user-123&likedKeywords=lofi,smooth&dislikedKeywords=remix
```

### Query Parameters
```
mood: string                    REQUIRED - One of: chill, sad, focus, hype
mood1: string                   OPTIONAL - Primary mood (alt to `mood`)
mood2: string                   OPTIONAL - Secondary mood (for blend)
weight1: number                 OPTIONAL - Primary weight 0-100 (default 50)
weight2: number                 OPTIONAL - Secondary weight 0-100 (default 50)
sessionId: string              OPTIONAL - Session ID for tracking
likedKeywords: string          OPTIONAL - Comma-separated liked keywords
dislikedKeywords: string       OPTIONAL - Comma-separated disliked keywords
```

### Response
```json
{
  "songs": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Artist - Song Name",
      "channelTitle": "Artist Channel",
      "thumbnail": "https://...",
      "score": 4.25,
      "viewCount": 150000,
      "likeCount": 3000,
      "duration": 210,
      "isMix": false
    }
  ],
  "blend": {
    "mood1": "chill",
    "mood2": null,
    "weight1": 100,
    "weight2": 0
  },
  "meta": {
    "source": "cache",
    "quotaSafe": true,
    "cacheHit": true
  }
}
```

### Examples

#### Single Mood
```javascript
// Get relaxed songs
fetch('/api/songs?mood=chill&sessionId=user-123')
  .then(r => r.json())
  .then(data => console.log(data.songs));
```

#### Mood Blend
```javascript
// 70% sad, 30% focus (for relaxing study)
fetch('/api/songs?mood1=sad&mood2=focus&weight1=70&weight2=30&sessionId=user-123')
  .then(r => r.json())
  .then(data => console.log(data.songs));
```

#### With Preferences
```javascript
// Chill mood, but boost lofi+smooth, exclude remixes
fetch('/api/songs?mood=chill&sessionId=user-123&likedKeywords=lofi,smooth&dislikedKeywords=remix')
  .then(r => r.json())
  .then(data => console.log(data.songs));
```

### Error Responses
```json
{
  "error": "Invalid primary mood"
}
```

---

## ⏭️ ENDPOINT 2: Next Song from Queue

### Request
```http
GET /api/next-song?sessionId=user-123
```

### Query Parameters
```
sessionId: string              REQUIRED - Session ID from /songs initialization
```

### Response
```json
{
  "song": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Loading..."
  },
  "meta": {
    "source": "queue",
    "quotaSafe": true,
    "queueStrategy": "weighted_random"
  }
}
```

### Behavior
- Returns next song from weighted random queue
- Automatically refills if queue < 5 songs
- Tracks in play history to avoid repeats
- **Never returns null**

### Example
```javascript
// Get next song
const response = await fetch('/api/next-song?sessionId=user-123');
const { song } = await response.json();
console.log(`Playing: ${song.title} (${song.videoId})`);
```

### Error Responses
```json
{
  "error": "sessionId required"
}
```
```json
{
  "error": "session mood not initialized; call /songs first"
}
```

---

## 📡 ENDPOINT 3: Prefetch Next (Lightweight)

### Request
```http
POST /api/prefetch-next
Content-Type: application/json

{
  "sessionId": "user-123"
}
```

### Body Parameters
```
sessionId: string              REQUIRED - Session ID
```

### Response
```json
{
  "status": "prefetch_queued",
  "queueSize": 18,
  "needsRefill": false,
  "meta": {
    "source": "prefetch",
    "quotaSafe": true,
    "noSearchNeeded": true
  }
}
```

### Behavior
- Called at ~75% of current song playback
- Checks if queue needs refilling
- **Never searches** (prefetch mode: allowSearch=false)
- Fills only from cache to avoid quota hit
- Returns queue status

### Example
```javascript
// At 75% playback, prefetch next
currentSong.addEventListener('timeupdate', (e) => {
  if (e.target.currentTime / e.target.duration >= 0.75) {
    fetch('/api/prefetch-next', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'user-123' })
    }).then(r => r.json())
     .then(data => console.log(`Queue size: ${data.queueSize}`));
  }
});
```

---

## ❤️ ENDPOINT 4: Like Video (Learning)

### Request
```http
POST /api/like
Content-Type: application/json

{
  "sessionId": "user-123",
  "videoId": "dQw4w9WgXcQ",
  "title": "Artist - Song Name",
  "channelTitle": "Artist Channel"
}
```

### Body Parameters
```
sessionId: string              REQUIRED - Session ID
videoId: string               REQUIRED - YouTube video ID
title: string                 OPTIONAL - Video title (for keyword extraction)
channelTitle: string          OPTIONAL - Channel name (for keyword extraction)
```

### Response
```json
{
  "ok": true,
  "message": "Video liked",
  "likedKeywords": ["artist", "song", "name"],
  "effect": "future_bias"
}
```

### Behavior
- Extracts keywords from title and channel
- Adds to session's `likedKeywords` (max 10)
- **Does NOT rebuild queue immediately** (lightweight)
- Biases future selections toward similar content
- On next refill, query includes liked keywords

### Keyword Extraction Examples
```
Title: "Arijit Singh - Meri Aabru"
Channel: "Arijit Singh Vevo"
→ Keywords: ["arijit", "singh", "meri", "aabru"]

Title: "Lofi Chill Mix 24/7"
Channel: "Lofi Hip Hop"
→ Keywords: ["lofi", "chill", "mix", "hip", "hop"]
```

### Example
```javascript
// User liked a song
await fetch('/api/like', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'user-123',
    videoId: 'dQw4w9WgXcQ',
    title: 'Arijit Singh - Meri Aabru',
    channelTitle: 'Arijit Singh Vevo'
  })
});
// Future queue will include more Arijit Singh songs
```

---

## 👎 ENDPOINT 5: Dislike Video (Immediate Adaptation)

### Request
```http
POST /api/dislike
Content-Type: application/json

{
  "sessionId": "user-123",
  "videoId": "dQw4w9WgXcQ",
  "title": "Unwanted Song",
  "channelTitle": "Bad Channel"
}
```

### Body Parameters
```
sessionId: string              REQUIRED - Session ID
videoId: string               REQUIRED - YouTube video ID
title: string                 OPTIONAL - Video title (for keyword extraction)
channelTitle: string          OPTIONAL - Channel name (for keyword extraction)
```

### Response
```json
{
  "ok": true,
  "message": "Video disliked",
  "dislikedKeywords": ["unwanted", "bad"],
  "effect": "immediate_removal_and_rebuild",
  "queueSize": 15
}
```

### Behavior
- Extracts keywords from title and channel
- Adds to session's `dislikedKeywords` (max 10)
- **Immediately removes similar videos from queue** (similarity > 50%)
- Rebuilds queue if drops below QUEUE_MIN_SIZE (5)
- Future searches exclude disliked keywords

### Similarity Matching
```javascript
// Similarity calculated as:
commonKeywords = dislikedKeywords ∩ videoKeywords
similarity = commonKeywords.length / videoKeywords.length

// Example:
disliked = ["remix", "nightcore", "cover"]
video1 keywords = ["remix", "nightcore", "lofi"] 
→ similarity = 2/3 = 67% → REMOVE

video2 keywords = ["lofi", "chill", "smooth"]
→ similarity = 0/3 = 0% → KEEP
```

### Example
```javascript
// User dislikes a remix
await fetch('/api/dislike', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'user-123',
    videoId: 'abc123',
    title: 'Phonk Remix Nightcore',
    channelTitle: 'Bad Remixes'
  })
});
// Similar remixes removed NOW
// Queue rebuilt if needed
```

---

## 📊 ENDPOINT 6: Session Preferences (Diagnostics)

### Request
```http
GET /api/session-preferences?sessionId=user-123
```

### Query Parameters
```
sessionId: string              REQUIRED - Session ID
```

### Response
```json
{
  "sessionId": "user-123",
  "mood": "chill",
  "likedKeywords": ["arijit", "lofi", "smooth"],
  "dislikedKeywords": ["remix", "nightcore", "cover"],
  "queueSize": 18,
  "playedCount": 5
}
```

### Use Cases
- Show user what preferences have been learned
- Debug which keywords are boosted/excluded
- Display in UI for transparency
- Reset if needed

### Example
```javascript
// Check current preferences
const prefs = await (await fetch('/api/session-preferences?sessionId=user-123')).json();
console.log('Liked:', prefs.likedKeywords);      // ["arijit", "lofi"]
console.log('Disliked:', prefs.dislikedKeywords); // ["remix"]
console.log('Queue size:', prefs.queueSize);      // 18
```

---

## 🔄 ENDPOINT 7: Reset Preferences

### Request
```http
POST /api/reset-preferences
Content-Type: application/json

{
  "sessionId": "user-123"
}
```

### Body Parameters
```
sessionId: string              REQUIRED - Session ID
```

### Response
```json
{
  "ok": true,
  "message": "Preferences reset",
  "likedKeywords": [],
  "dislikedKeywords": []
}
```

### Behavior
- Clears all learned keywords
- Session keeps same mood and queue
- Next refill uses base mood query only
- Useful for: fresh start, remove learning, etc.

### Example
```javascript
// Reset learning for fresh start
await fetch('/api/reset-preferences', {
  method: 'POST',
  body: JSON.stringify({ sessionId: 'user-123' })
});
// System forgets all likes/dislikes
```

---

## 🎯 ENDPOINT 8: Queue Status (Diagnostics)

### Request
```http
GET /api/queue-status?sessionId=user-123
```

### Query Parameters
```
sessionId: string              REQUIRED - Session ID
```

### Response
```json
{
  "sessionId": "user-123",
  "queueSize": 18,
  "playedCount": 5,
  "currentMood": "chill",
  "meta": {
    "quotaSafe": true,
    "cacheSize": 4,
    "activeSessions": 12
  }
}
```

### Use Cases
- Monitor queue health
- Check how many songs played
- Verify mood is correct
- Debug system state

---

## 📈 ENDPOINT 9: Video Stats

### Request
```http
GET /api/song/dQw4w9WgXcQ/stats
```

### Response
```json
{
  "viewCount": "150000",
  "likeCount": "3000",
  "channelTitle": "Artist Channel",
  "publishedAt": "2020-01-01T00:00:00Z"
}
```

### Quota Cost
- 1 API unit per call
- Use sparingly for UI details only

---

## 📝 ENDPOINT 10: Recent Songs

### Add to Recent
```http
POST /api/recent
Content-Type: application/json

{
  "sessionId": "user-123",
  "videoId": "dQw4w9WgXcQ",
  "title": "Song Name",
  "channelTitle": "Artist"
}
```

### Get Recent
```http
GET /api/recent?sessionId=user-123
```

### Response
```json
{
  "recent": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Song 1",
      "channelTitle": "Artist 1",
      "playedAt": 1707821400000
    },
    {
      "videoId": "abc123",
      "title": "Song 2",
      "channelTitle": "Artist 2",
      "playedAt": 1707821350000
    }
  ]
}
```

---

## 🔌 Integration Examples

### React Example
```javascript
const MoodyPlayer = () => {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [currentSong, setCurrentSong] = useState(null);

  // Initialize with mood
  const selectMood = async (mood) => {
    const res = await fetch(`/api/songs?mood=${mood}&sessionId=${sessionId}`);
    const { songs } = await res.json();
    setCurrentSong(songs[0]);
  };

  // Get next song
  const playNext = async () => {
    const res = await fetch(`/api/next-song?sessionId=${sessionId}`);
    const { song } = await res.json();
    setCurrentSong(song);
  };

  // Like current song
  const likeSong = () => {
    fetch('/api/like', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        videoId: currentSong.videoId,
        title: currentSong.title,
        channelTitle: currentSong.channelTitle
      })
    });
  };

  // Dislike current song
  const dislikeSong = () => {
    fetch('/api/dislike', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        videoId: currentSong.videoId,
        title: currentSong.title,
        channelTitle: currentSong.channelTitle
      })
    }).then(() => playNext()); // Auto-play next
  };

  return (
    <div>
      <button onClick={() => selectMood('chill')}>Chill</button>
      <button onClick={() => selectMood('sad')}>Sad</button>
      <button onClick={playNext}>Next</button>
      <button onClick={likeSong}>❤️</button>
      <button onClick={dislikeSong}>👎</button>
      {currentSong && <p>{currentSong.title}</p>}
    </div>
  );
};
```

### cURL Examples
```bash
# Get chill songs
curl 'http://localhost:5000/api/songs?mood=chill&sessionId=user-123'

# Get next song
curl 'http://localhost:5000/api/next-song?sessionId=user-123'

# Like a song
curl -X POST http://localhost:5000/api/like \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"user-123","videoId":"abc123","title":"Song","channelTitle":"Artist"}'

# Dislike a song
curl -X POST http://localhost:5000/api/dislike \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"user-123","videoId":"abc123","title":"Bad","channelTitle":"Channel"}'

# Check preferences
curl 'http://localhost:5000/api/session-preferences?sessionId=user-123'

# Reset preferences
curl -X POST http://localhost:5000/api/reset-preferences \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"user-123"}'
```

---

## ⚡ Performance Tips

### Cache Hits
- First call to /songs for a mood: 100 quota units
- Subsequent calls: 0 quota units (cached 12 min)
- Cache reused across all sessions

### Queue Management
- Queue auto-refills at 5 songs
- Prefetch at 75% playback
- Never wait for search

### Quota Savings
```
Scenario: 10 users, each plays 1 hour chill music
Without optimization: 10 × 36 searches = 3,600 units
With caching: 1 search + reuse = 100 units
Savings: 97% ✅
```

---

## 🐛 Error Handling

### Common Errors
```
"sessionId required" 
→ Pass sessionId in query or body

"session mood not initialized; call /songs first"
→ Must call /songs before /next-song

"Invalid primary mood"
→ Use one of: chill, sad, focus, hype

"Could not fetch song"
→ Queue empty and recovery failed (rare)
```

### Debug Tips
```javascript
// Check queue status before next-song
const status = await (await fetch(`/api/queue-status?sessionId=${sid}`)).json();
console.log(`Queue: ${status.queueSize}, Played: ${status.playedCount}`);

// Check preferences before each refill
const prefs = await (await fetch(`/api/session-preferences?sessionId=${sid}`)).json();
console.log('Preferences:', prefs.likedKeywords, prefs.dislikedKeywords);
```

---

Status: ✅ Production Ready  
Last Updated: 2026-04-16
