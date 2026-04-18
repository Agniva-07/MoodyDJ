# 🔄 Complete Data Flow Diagrams

## 1. YouTube Player Fix Flow

```
┌─────────────────────────────────────────────────────┐
│ App Loads / Songs Array Updated                    │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ useEffect checks: songs.length > 0 ?               │
│ ✅ YES → Continue                                   │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ Check if YouTube API loaded (window.YT)            │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    YES ▼                   ▼ NO
┌────────────┐    ┌──────────────────────┐
│ createPlayer│    │ Load API script      │
│ immediately │    │ from YouTube        │
└───┬────────┘    │ onYouTubeIframeAPI  │
    │             │ Ready → createPlayer│
    │             └──────────┬──────────┘
    │                       │
    └───────────┬───────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│ new YT.Player("player", {                           │
│   videoId: songs[0].videoId,                        │
│   events: {                                         │
│     onReady: (event) => {                           │
│       ✅ playerRef.current = event.target;         │
│       ✅ Store instance here!                       │
│     }                                               │
│   }                                                 │
│ })                                                  │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ Console: ✅ YouTube player ready                   │
│ playerRef.current = YT.Player {...}                │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ currentIndex or songs changes                       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ if (playerRef.current &&                            │
│     typeof playerRef.current.loadVideoById          │
│     === "function") {                               │
│   ✅ playerRef.current.loadVideoById(videoId);     │
│ }                                                   │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ ✅ NEW VIDEO PLAYS                                  │
│ setLiked(false)                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. Like Button Flow

```
                 USER CLICKS LIKE BUTTON (♥)
                           │
                           ▼
            ┌──────────────────────────┐
            │ onClick={onLike}         │
            └─────────┬────────────────┘
                      │
                      ▼
            ┌──────────────────────────┐
            │ handleLike() called       │
            │ const song = songs[...]   │
            │ if (!song) return         │
            └─────────┬────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ setLiked(prev => !prev)    │
         │ ✅ Heart turns red instantly│
         └─────────┬──────────────────┘
                   │
                   ▼
         ┌─────────────────────────────────────────┐
         │ try {                                   │
         │   axios.post("/api/like", {            │
         │     sessionId,                          │
         │     videoId,                            │
         │     title,                              │
         │     channelTitle                        │
         │   })                                    │
         │ }                                       │
         └─────────┬───────────────────────────────┘
                   │
                   ▼
         ┌────────────────────────────┐
         │ BACKEND /api/like endpoint │
         │ - Extract keywords        │
         │ - Add to session pref      │
         │ - Store in DB             │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────────────┐
         │ Console: ❤️ Like registered        │
         │ Response: {ok: true, ...}         │
         └────────────┬────────────────────────┘
                      │
                      ▼
      ┌──────────────────────────────┐
      │ Update local likedSongs[]    │
      │ localStorage.setItem(...)    │
      └──────────────┬───────────────┘
                     │
              ┌──────┴──────┐
         USER CLICKS LIKE AGAIN: ❤️ → ⚪
         Song Changes: ❤️ → ⚪ (setLiked(false))
         
         Future searches use liked keywords! 🎉
```

---

## 3. Dislike Button Flow

```
              USER CLICKS DISLIKE BUTTON (👎)
                         │
                         ▼
          ┌───────────────────────────┐
          │ onClick={onDislike}        │
          └────────────┬──────────────┘
                       │
                       ▼
          ┌───────────────────────────┐
          │ handleDislike() called     │
          │ const song = songs[...]    │
          │ if (!song) return          │
          └────────────┬──────────────┘
                       │
    ┌──────────────────┴──────────────────┐
    │                                      │
    ▼ STEP 1                               ▼ STEP 2
┌──────────────────────┐         ┌──────────────────────┐
│ POST /api/dislike    │         │ setSongs([])         │
│ - videoId            │         │ setCurrentIndex(0)   │
│ - title              │         │ setPlayedIds({})     │
│ - channelTitle       │         │ ✅ Queue clears     │
│                      │         │ ✅ UI updates now   │
│ Backend:             │         └──────┬───────────────┘
│ - Extract keywords   │                │
│ - Add to disliked[]  │                │
│ - Remove similar     │                │
│   videos from queue  │                │
│ - Rebuild if needed  │                │
└────────┬─────────────┘                │
         │                              │
         └──────────────┬───────────────┘
                        │
                        ▼
          ┌────────────────────────────┐
          │ GET /api/songs?            │
          │ mood=chill&sessionId=xxx   │
          │                            │
          │ ✅ Fetches 15+ new songs  │
          │ ✅ Similar ones excluded  │
          └────────────┬───────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │ setSongs(newSongs)        │
          │ setCurrentIndex(0)        │
          │ ✅ Queue refills         │
          │ ✅ UI shows new songs    │
          └────────────┬──────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │ if (newSongs.length > 0) │
          │   playerRef.current      │
          │   .loadVideoById(        │
          │     newSongs[0].videoId  │
          │   )                      │
          │   setLiked(false)        │
          └────────────┬──────────────┘
                       │
                       ▼
         ┌────────────────────────────┐
         │ ✅ New song plays         │
         │ ✅ Heart resets to white  │
         │ ✅ Queue no longer has    │
         │    similar songs          │
         │                           │
         │ Console output:           │
         │ 👎 Dislike registered    │
         │ ✅ Queue updated with N  │
         │    new songs             │
         │ ▶️ Playing new song      │
         └────────────────────────────┘
```

---

## 4. Complete User Journey

```
START: User loads app http://localhost:5173
        │
        ▼
    ┌─────────────────────────────┐
    │ Landing Page                │
    │ - Select mood (chill/sad...)│
    └──────────┬──────────────────┘
               │
        ✅ /api/songs called
               │
               ▼
    ┌─────────────────────────────┐
    │ Player Page                 │
    │ - 15+ songs loaded          │
    │ - First song ready          │
    │ - ✅ YouTube player ready   │
    └──────────┬──────────────────┘
               │
        ▶️ First song plays
               │
    ┌──────────┴──────────┐
    │                      │
    ▼ User Action         ▼ User Action
┌────────────────┐     ┌────────────────┐
│ Clicks LIKE (♥) │    │ Clicks DISLIKE │
└────┬───────────┘     └────┬───────────┘
     │                      │
     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐
│ Heart red        │  │ Queue clears     │
│ ❤️ ← ⚪         │  │ New 15+ songs   │
│ /api/like called│  │ /api/dislike     │
│ Future songs    │  │ + /api/songs     │
│ biased!         │  │ called           │
└────┬────────────┘  │ First song plays │
     │               │ automatically    │
     │               └────┬─────────────┘
     │                    │
     └────────┬───────────┘
              │
              ▼
         SONG ENDS
              │
              ▼
    ┌─────────────────────┐
    │ Auto-advance        │
    │ Next song plays     │
    │ ✅ Queue refills    │
    │ ❤️ Resets to ⚪    │
    └─────────┬───────────┘
              │
              ▼
         Loop: User likes/dislikes...
         Repeat flow above
```

---

## 5. State Management Timeline

```
INITIAL STATE:
├── liked = false
├── songs = []
├── currentIndex = 0
├── sessionId = "sess-123"
└── playerRef = null

USER SELECTS MOOD "chill":
├── GET /api/songs called
├── songs = [{id:"abc"}, {id:"def"}, ...]
├── currentIndex = 0
├── playerRef = new YT.Player()  ✅ FIXED
└── liked = false

SONG LOADS (currentIndex changes):
├── playerRef.loadVideoById("abc")
├── fetchStats("abc")
├── POST /api/recent
└── setLiked(false)  ✅ RESET

USER CLICKS LIKE:
├── liked = false → true  ✅ IMMEDIATE UI
├── POST /api/like
│   ├── sessionId: "sess-123"
│   ├── videoId: "abc"
│   └── title: "Song Name"
├── likedSongs = [..., {id:"abc"}]
└── localStorage updated

NEXT SONG PLAYS:
├── currentIndex = 1
├── playerRef.loadVideoById("def")
├── fetchStats("def")
├── POST /api/recent
├── liked = true → false  ✅ RESET
└── Console: ❤️ Like registered (from previous)

USER CLICKS DISLIKE:
├── currentIndex = 1 (on "def")
├── POST /api/dislike
│   ├── sessionId: "sess-123"
│   ├── videoId: "def"
│   └── title: "Bad Song"
├── songs = []  ✅ CLEAR
├── GET /api/songs
├── songs = [{id:"xyz"}, {id:"123"}, ...]  ✅ NEW
├── currentIndex = 0
├── playerRef.loadVideoById("xyz")  ✅ NEW SONG
├── liked = false  ✅ RESET
└── Console:
    - 👎 Dislike registered
    - ✅ Queue updated with 15 new songs
    - ▶️ Playing new song: xyz

REPEAT CYCLE...
```

---

## 6. Component Prop Flow

```
App.jsx (State Management)
│
├── State:
│   ├── liked ─────────────┐
│   ├── songs ──────────┐  │
│   ├── currentIndex    │  │
│   └── playerRef       │  │
│                       │  │
├── Handlers:           │  │
│   ├── handleLike ─────┼─────────────┐
│   └── handleDislike ──┼────┐        │
│                       │    │        │
│       ┌───────────────┘    │        │
│       │                    │        │
│       ▼                    ▼        ▼
├─ Route: /player
    │
    └─ <PlayerPage
        liked={liked}              ✅ NEW
        onLike={handleLike}
        onDislike={handleDislike}
        songs={songs}
        currentIndex={currentIndex}
    />
        │
        ├─ <PlayerCard
        │   liked={liked}          ✅ NEW
        │   onLike={onLike}
        │   onDislike={onDislike}
        │/>
        │   │
        │   └─ Like Button: color={liked?"red":"white"} ✅ NEW
        │   └─ Dislike Button: onClick={onDislike}
        │   └─ YouTube div: <div id="player"/>
        │
        └─ <QueuePanel
            songs={songs}
            currentIndex={currentIndex}
        />
            │
            └─ Song List (updates when songs state changes)
```

---

## 7. API Call Sequence Diagram

```
CLIENT                          SERVER
  │                               │
  ├──── GET /api/songs ────────>  │
  │     (mood, sessionId,         │ ✅ /songs endpoint
  │      likedKeywords,           │   - Check cache
  │      dislikedKeywords)        │   - Multi-query search
  │                               │   - Score videos
  │  <──── 15+ songs ─────────────┤
  │     (videoId, title, score)   │
  │                               │
  │  [SONG PLAYING...]            │
  │                               │
  ├──── POST /api/like ────────>  │
  │     (sessionId, videoId,      │ ✅ /like endpoint
  │      title, channelTitle)     │   - Extract keywords
  │                               │   - Add to session pref
  │  <──── {ok:true} ─────────────┤
  │                               │
  │  [ANOTHER SONG PLAYING...]    │
  │                               │
  ├──── POST /api/dislike ────->  │
  │     (sessionId, videoId,      │ ✅ /dislike endpoint
  │      title, channelTitle)     │   - Extract keywords
  │                               │   - Remove from queue
  │  <──── {ok:true} ─────────────┤   - Rebuild queue
  │                               │
  ├──── GET /api/songs ────────>  │
  │     (with updated prefs)      │ ✅ /songs endpoint
  │                               │   - Uses new prefs
  │  <──── 15+ new songs ─────────┤   - No similar videos
  │                               │
  │  [NEW SONG PLAYS]             │
  │                               │
  └───────────────────────────────┘
  CYCLE REPEATS...
```

---

## 8. Error Handling Flow

```
User Action (Like/Dislike)
        │
        ▼
     try {
        │
        ├─ POST /api/like or /api/dislike
        │
        ├─ UI updates immediately (setLiked, setSongs)
        │
        ├─ Response received?
        │
        ▼ YES
    } catch (err) {
        │
        ├─ console.error("Like failed:", err)
        │
        ├─ UI still responsive
        │
        └─ User can retry
    }
    
    ✅ No crashes
    ✅ Clear error messages
    ✅ Graceful fallback
```

---

## Summary

✅ All 4 fixes work together to create a smooth user experience:

1. **Player fix** → No crashes ✅
2. **Like button** → Visual feedback ✅
3. **Dislike button** → Queue updates ✅
4. **State management** → Everything synced ✅

Status: ✅ READY FOR TESTING
