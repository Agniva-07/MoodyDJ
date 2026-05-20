const express = require("express");
const axios = require("axios");
const { getRecentSongs, addRecentSongs } = require("../recentSongs");

const router = express.Router();

// ============================================================
// UTILITY: Non-blocking task executor (must be defined early)
// ============================================================
const runNonBlocking = (task) => {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error("Background task failed:", error.message);
    });
};

// ============================================================
// PHASE 2: PART A - Quota Tracker & Fallback System
// ============================================================
function getNextMidnightPT() {
  const now = new Date();
  const ptString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const ptDate = new Date(ptString);
  ptDate.setHours(24, 0, 0, 0);
  const diff = now.getTime() - new Date(ptString).getTime();
  return ptDate.getTime() + diff;
}

const quotaTracker = { 
  unitsUsed: 0, 
  resetTime: getNextMidnightPT(),
  zeroApiMode: false
};

router.quotaTracker = quotaTracker;
router.getNextMidnightPT = getNextMidnightPT;

async function initQuotaTracker() {
  try {
    const db = require("../firebaseAdmin").initFirebaseAdmin();
    if (!db) return;
    const doc = await db.collection("system").doc("quotaTracker").get();
    if (doc.exists) {
      const data = doc.data();
      const now = Date.now();
      // Only restore if it's still the same day
      if (data.resetTime > now) {
        quotaTracker.unitsUsed = data.unitsUsed || 0;
        quotaTracker.resetTime = data.resetTime;
        if (quotaTracker.unitsUsed >= 8500) quotaTracker.zeroApiMode = true;
        console.log(`📊 Restored quota: ${quotaTracker.unitsUsed}/10000`);
      } else {
        // Reset time passed, update Firestore to 0
        await db.collection("system").doc("quotaTracker").set({
          unitsUsed: 0,
          resetTime: getNextMidnightPT()
        });
        console.log("🔄 Reset time passed, initialized quota to 0 in Firestore");
      }
    } else {
      // Document does not exist, initialize it
      await db.collection("system").doc("quotaTracker").set({
        unitsUsed: 0,
        resetTime: getNextMidnightPT()
      });
    }
  } catch(e) { console.error("quota restore failed", e.message); }
}

runNonBlocking(initQuotaTracker);

function trackQuotaUsage(units) {
  quotaTracker.unitsUsed += units;
  console.log(`📊 Quota Usage: ${quotaTracker.unitsUsed}/10000 units`);
  if (quotaTracker.unitsUsed >= 8500 && !quotaTracker.zeroApiMode) {
    quotaTracker.zeroApiMode = true;
    console.log("🔴 ZERO API MODE: All requests serving from local memory only");
  }
  
  // Persist periodically (every 200 units)
  if (quotaTracker.unitsUsed % 200 < units) {
    runNonBlocking(async () => {
      try {
        const db = require("../firebaseAdmin").initFirebaseAdmin();
        if (db) {
          await db.collection("system").doc("quotaTracker").set({
            unitsUsed: quotaTracker.unitsUsed,
            resetTime: quotaTracker.resetTime
          }, { merge: true });
        }
      } catch(e) {}
    });
  }
}

function isQuotaSafe(units) {
  return quotaTracker.unitsUsed + units <= 7000;
}

// PHASE 2: PART C - Fallback Chain
const getFallbackSongs = async (type, query, userId) => {
  // Level 0 — sessionSongPool (accumulated songs from all searches this server session)
  if (query) {
    const poolKey = query.toLowerCase().trim();
    for (const [key, poolSongs] of sessionSongPool.entries()) {
      if (key.includes(poolKey) || poolKey.includes(key)) {
        if (poolSongs.length > 0) {
          console.log(`♻️ LEVEL 0 HIT: sessionSongPool key '${key}' has ${poolSongs.length} songs`);
          const shuffled = [...poolSongs].sort(() => Math.random() - 0.5).slice(0, 15);
          return { songs: shuffled, source: "sessionPool", quotaSafeMode: true };
        }
      }
    }
  }

  // Level 1 — artistCache check
  if (query) {
    const qLower = query.toLowerCase();
    for (const [artistName, cacheData] of artistCache.entries()) {
      if (qLower.includes(artistName) || artistName.includes(qLower)) {
        if (Date.now() - cacheData.timestamp < ARTIST_CACHE_TTL) {
          const videos = cacheData.videos;
          const offset = Math.floor(Math.random() * Math.max(1, videos.length));
          let selected = [];
          for (let i = 0; i < 15 && i < videos.length; i++) {
            selected.push(videos[(offset + i) % videos.length]);
          }
          const shuffled = [];
          for (let i = selected.length - 1; i >= 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [selected[i], selected[j]] = [selected[j], selected[i]];
            shuffled.push(selected[i]);
          }
          return { songs: shuffled, source: "cache", quotaSafeMode: true };
        }
      }
    }
  }

  // Level 2 — Firestore history
  if (userId) {
    try {
      const db = require("../firebaseAdmin").initFirebaseAdmin();
      if (db) {
        const historySnapshot = await db.collection("recentSongs").doc(userId).get();
        if (historySnapshot.exists) {
          let historyVideos = historySnapshot.data().history || [];
          if (query) {
            const qLower = query.toLowerCase();
            historyVideos = historyVideos.filter(v => 
              v.title?.toLowerCase().includes(qLower) || 
              v.channelTitle?.toLowerCase().includes(qLower)
            );
          }
          if (historyVideos.length > 0) {
            for (let i = historyVideos.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [historyVideos[i], historyVideos[j]] = [historyVideos[j], historyVideos[i]];
            }
            return { songs: historyVideos.slice(0, 15), source: "history", quotaSafeMode: true };
          }
        }
      }
    } catch (e) {
      console.error("Level 2 Fallback error:", e.message);
    }
  }

  // Level 3 — Hardcoded seeds
  const SEED_SONGS = {
    chill: [
      { videoId: "Umqb9KENgmk", title: "Tum Hi Ho (Aashiqui 2)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/Umqb9KENgmk/mqdefault.jpg" },
      { videoId: "Kz69P-u168o", title: "Raabta (Agent Vinod)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/Kz69P-u168o/mqdefault.jpg" },
      { videoId: "ktP7-x7x00s", title: "Baarishein (Anuv Jain)", channelTitle: "Anuv Jain", thumbnail: "https://i.ytimg.com/vi/ktP7-x7x00s/mqdefault.jpg" },
      { videoId: "uQ79-Vn1v6U", title: "Slow Motion (Bharat)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/uQ79-Vn1v6U/mqdefault.jpg" },
      { videoId: "hoNb6HuNmU0", title: "Khairiyat (Chhichhore)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/hoNb6HuNmU0/mqdefault.jpg" },
      { videoId: "dZ0fwJ1OoEA", title: "Bekhayali (Kabir Singh)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/dZ0fwJ1OoEA/mqdefault.jpg" },
      { videoId: "sK7riqg2mrA", title: "Agar Tum Saath Ho", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/sK7riqg2mrA/mqdefault.jpg" },
      { videoId: "bzSTpdcs-EI", title: "Channa Mereya", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/bzSTpdcs-EI/mqdefault.jpg" },
      { videoId: "1-xGerv5FOk", title: "Phir Le Aya Dil", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/1-xGerv5FOk/mqdefault.jpg" },
      { videoId: "fdubeMFwuZI", title: "Ilahi (YJHD)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/fdubeMFwuZI/mqdefault.jpg" },
      { videoId: "jHNNMj5bNQw", title: "Kabira (YJHD)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/jHNNMj5bNQw/mqdefault.jpg" },
      { videoId: "BwqQawK4Luw", title: "Enna Sona", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/BwqQawK4Luw/mqdefault.jpg" },
      { videoId: "2bW1xR1wMhI", title: "Pehla Nasha", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/2bW1xR1wMhI/mqdefault.jpg" },
      { videoId: "1p7T1j6d1t8", title: "Tujhe Bhula Diya", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/1p7T1j6d1t8/mqdefault.jpg" },
      { videoId: "A5pSnIwbpaM", title: "Soch Na Sake", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/A5pSnIwbpaM/mqdefault.jpg" }
    ],
    sad: [
      { videoId: "1wRXb8tHl6Q", title: "Judaai (Badlapur)", channelTitle: "Eros Now", thumbnail: "https://i.ytimg.com/vi/1wRXb8tHl6Q/mqdefault.jpg" },
      { videoId: "JmD8hJ3K1k4", title: "Woh Lamhe", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/JmD8hJ3K1k4/mqdefault.jpg" },
      { videoId: "mBpsI1c0g2U", title: "Dil Dhadakne Do title track", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/mBpsI1c0g2U/mqdefault.jpg" },
      { videoId: "Ww1Be-m5gQY", title: "Hamari Adhuri Kahani", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/Ww1Be-m5gQY/mqdefault.jpg" },
      { videoId: "qNawhQ-Kz8w", title: "Tere Bina (Guru)", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/qNawhQ-Kz8w/mqdefault.jpg" },
      { videoId: "VAlj_4tB_8g", title: "Ik Vaari Aa", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/VAlj_4tB_8g/mqdefault.jpg" },
      { videoId: "h-g0x-vRiy8", title: "Main Dhoondne Ko Zamaane Mein", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/h-g0x-vRiy8/mqdefault.jpg" },
      { videoId: "kpdv3BvTz1U", title: "O Saathi (Baaghi 2)", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/kpdv3BvTz1U/mqdefault.jpg" },
      { videoId: "vUCM_0evdQY", title: "Ae Dil Hai Mushkil", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/vUCM_0evdQY/mqdefault.jpg" },
      { videoId: "_K1v2L13d8-I", title: "Baarish (Half Girlfriend)", channelTitle: "Zee Music Company", thumbnail: "https://i.ytimg.com/vi/_K1v2L13d8-I/mqdefault.jpg" },
      { videoId: "wF289n94T9I", title: "Teri Mitti", channelTitle: "Zee Music Company", thumbnail: "https://i.ytimg.com/vi/wF289n94T9I/mqdefault.jpg" },
      { videoId: "ePO5M5DE01I", title: "Dil Diyan Gallan", channelTitle: "YRF", thumbnail: "https://i.ytimg.com/vi/ePO5M5DE01I/mqdefault.jpg" },
      { videoId: "y68-tW_4M9I", title: "Zara Sa", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/y68-tW_4M9I/mqdefault.jpg" }
    ],
    focus: [
      { videoId: "UDVtMYqUAyw", title: "Interstellar Theme Hans Zimmer", channelTitle: "Hans Zimmer", thumbnail: "https://i.ytimg.com/vi/UDVtMYqUAyw/mqdefault.jpg" },
      { videoId: "RxabLA7UQ9k", title: "Time Hans Zimmer", channelTitle: "Hans Zimmer", thumbnail: "https://i.ytimg.com/vi/RxabLA7UQ9k/mqdefault.jpg" },
      { videoId: "1VRZq3J0uz4", title: "Cornfield Chase", channelTitle: "Hans Zimmer", thumbnail: "https://i.ytimg.com/vi/1VRZq3J0uz4/mqdefault.jpg" },
      { videoId: "hN_q-_nGv4U", title: "Experience Ludovico Einaudi", channelTitle: "Ludovico Einaudi", thumbnail: "https://i.ytimg.com/vi/hN_q-_nGv4U/mqdefault.jpg" },
      { videoId: "2nB1jZ2q9A4", title: "Uma Thurman Fall Out Boy", channelTitle: "Fall Out Boy", thumbnail: "https://i.ytimg.com/vi/2nB1jZ2q9A4/mqdefault.jpg" },
      { videoId: "7wtfhZwyrcc", title: "Believer Imagine Dragons", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/7wtfhZwyrcc/mqdefault.jpg" },
      { videoId: "ktvTqknDobU", title: "Radioactive Imagine Dragons", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/ktvTqknDobU/mqdefault.jpg" },
      { videoId: "mk48xRzuNvA", title: "Hall of Fame The Script", channelTitle: "The Script", thumbnail: "https://i.ytimg.com/vi/mk48xRzuNvA/mqdefault.jpg" },
      { videoId: "hT_nvWreIhg", title: "Counting Stars OneRepublic", channelTitle: "OneRepublic", thumbnail: "https://i.ytimg.com/vi/hT_nvWreIhg/mqdefault.jpg" },
      { videoId: "0I647GU3Jsc", title: "Natural Imagine Dragons", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/0I647GU3Jsc/mqdefault.jpg" },
      { videoId: "fKopy74weus", title: "Thunder Imagine Dragons", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/fKopy74weus/mqdefault.jpg" },
      { videoId: "D9G1VOjN_84", title: "Enemy Imagine Dragons Arcane", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/D9G1VOjN_84/mqdefault.jpg" },
      { videoId: "fmI_Ndrxy14", title: "Warriors Imagine Dragons", channelTitle: "Imagine Dragons", thumbnail: "https://i.ytimg.com/vi/fmI_Ndrxy14/mqdefault.jpg" },
      { videoId: "fB8TyLTD7EE", title: "Rise League of Legends", channelTitle: "League of Legends", thumbnail: "https://i.ytimg.com/vi/fB8TyLTD7EE/mqdefault.jpg" },
      { videoId: "ZrqcFrqMAVQ", title: "Ignite League of Legends", channelTitle: "League of Legends", thumbnail: "https://i.ytimg.com/vi/ZrqcFrqMAVQ/mqdefault.jpg" }
    ],
    hype: [
      { videoId: "vBw2clyP0Kk", title: "Bala Bala Shaitan Ka Saala", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/vBw2clyP0Kk/mqdefault.jpg" },
      { videoId: "qFkNATtc3mc", title: "Ghungroo (War)", channelTitle: "YRF", thumbnail: "https://i.ytimg.com/vi/qFkNATtc3mc/mqdefault.jpg" },
      { videoId: "4h-M6xJ3XvQ", title: "Malang title track", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/4h-M6xJ3XvQ/mqdefault.jpg" },
      { videoId: "i9mJ9yZ-cPY", title: "Illegal Weapon 2.0", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/i9mJ9yZ-cPY/mqdefault.jpg" },
      { videoId: "dv11H-84x9I", title: "Tamma Tamma Again", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/dv11H-84x9I/mqdefault.jpg" },
      { videoId: "e-U0IVZ96e0", title: "Disco Deewane", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/e-U0IVZ96e0/mqdefault.jpg" },
      { videoId: "F07e3Y-P6mQ", title: "Zingaat Hindi", channelTitle: "Zee Music Company", thumbnail: "https://i.ytimg.com/vi/F07e3Y-P6mQ/mqdefault.jpg" },
      { videoId: "n0Q0Q7P3CAU", title: "Kar Gayi Chull", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/n0Q0Q7P3CAU/mqdefault.jpg" },
      { videoId: "yuCBIJ7s-bE", title: "Badtameez Dil", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/yuCBIJ7s-bE/mqdefault.jpg" },
      { videoId: "05TA9jNnCdU", title: "Galti Se Mistake", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/05TA9jNnCdU/mqdefault.jpg" },
      { videoId: "Wd2B8OAotU8", title: "Nashe Si Chadh Gayi", channelTitle: "YRF", thumbnail: "https://i.ytimg.com/vi/Wd2B8OAotU8/mqdefault.jpg" },
      { videoId: "7tJ4R1_a37k", title: "Saturday Saturday Humpty Sharma", channelTitle: "Sony Music India", thumbnail: "https://i.ytimg.com/vi/7tJ4R1_a37k/mqdefault.jpg" },
      { videoId: "bjg50S0P0pA", title: "London Thumakda", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/bjg50S0P0pA/mqdefault.jpg" },
      { videoId: "9Q6c4yJ2_9c", title: "Desi Beat", channelTitle: "T-Series", thumbnail: "https://i.ytimg.com/vi/9Q6c4yJ2_9c/mqdefault.jpg" },
      { videoId: "CKm30a03-7s", title: "Lat Lag Gayee", channelTitle: "Tips Official", thumbnail: "https://i.ytimg.com/vi/CKm30a03-7s/mqdefault.jpg" }
    ]
  };
  SEED_SONGS.default = SEED_SONGS.chill;

  let moodKey = "default";
  if (query) {
    const qLower = query.toLowerCase();
    moodKey = Object.keys(SEED_SONGS).find(key => qLower.includes(key)) || "default";
  }

  return {
    songs: SEED_SONGS[moodKey],
    source: "seed",
    quotaSafeMode: true
  };
};

// ============================================================
// QUOTA OPTIMIZATION: Cache & Session Management
// ============================================================

// Search result cache (key = moodKeyword)
const searchCache = new Map();

// Artist search cache for Solo Mode (shared across ALL users on this server)
const artistCache = new Map();
const ARTIST_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// Video scoring cache (cached scores + metrics)
const scoredVideosCache = new Map();
// ✅ FIXED: Prevent cache stampede on the same mood search key
const pendingSearches = new Map();

// Session queues (sessionId → {videos, scores, queued})
const sessionQueues = new Map();

// Played history per session (sessionId → Set of videoIds)
const playedHistory = new Map();

// Session metadata
const sessionHistory = new Map();

// SECTION 4B: sessionSongPool — accumulates ALL songs ever loaded this server session
const sessionSongPool = new Map();

// SECTION 7B: blendCache — caches blend results (sorted moods + weights as key)
const blendCache = new Map();

// SECTION 3B: moodQueryRotation — tracks which query variant to use per mood
const moodQueryRotation = new Map();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SCORE_CACHE_TTL = 60 * 60 * 1000; // ✅ FIXED: score cache TTL 60 mins
const SESSION_TTL = 30 * 60 * 1000; // ✅ FIXED: session TTL 30 mins
const QUEUE_MIN_SIZE = 5;
const QUEUE_PREFILL_SIZE = 20;
const MAX_PLAYED_HISTORY = 50;
const DEFAULT_MOOD = "chill";

// Duration thresholds for Singles and Playlists / Mixes
const SINGLE_MIN = 180; // 3 mins
const SINGLE_MAX = 600; // 10 mins
const PLAYLIST_MIN = 1200; // 20 mins
const PLAYLIST_MAX = 3600; // 60 mins
const VIEW_COUNT_BOOST_THRESHOLD = 100000; // 100k views for boost
const DEFAULT_FALLBACK_SCORE = 1; // Fallback score for videos without stats

// SECTION 3B: Rich mood keyword arrays with rotation support
const MOOD_KEYWORDS_ARRAYS = {
  chill: [
    "lofi hindi chill official",
    "hindi acoustic relaxing official audio",
    "late night hindi songs official",
    "soft hindi romantic official"
  ],
  sad: [
    "hindi sad songs official audio",
    "emotional hindi songs T-Series",
    "breakup hindi songs official",
    "hindi dard bhari songs official"
  ],
  focus: [
    "hindi instrumental background music",
    "classical indian focus music",
    "lofi study beats hindi",
    "peaceful indian instrumental official"
  ],
  hype: [
    "hindi party songs official",
    "hindi workout songs T-Series",
    "bollywood dance hits official",
    "hindi item songs official audio"
  ],
  bengali: [
    "bengali modern songs official",
    "bangla gaan SVF Music",
    "bengali romantic songs official",
    "Saregama Bengali official"
  ]
};

// Legacy compat: MOOD_KEYWORDS returns the current rotated query string
const MOOD_KEYWORDS = new Proxy({}, {
  get(target, mood) {
    const arr = MOOD_KEYWORDS_ARRAYS[mood];
    if (!arr) return undefined;
    const idx = moodQueryRotation.get(mood) || 0;
    return arr[idx % arr.length];
  },
  has(target, mood) {
    return mood in MOOD_KEYWORDS_ARRAYS;
  },
  ownKeys() {
    return Object.keys(MOOD_KEYWORDS_ARRAYS);
  },
  getOwnPropertyDescriptor(target, mood) {
    if (mood in MOOD_KEYWORDS_ARRAYS) {
      return { configurable: true, enumerable: true, value: MOOD_KEYWORDS_ARRAYS[mood][0] };
    }
  }
});

// Advance mood query rotation for a mood
const advanceMoodRotation = (mood) => {
  const arr = MOOD_KEYWORDS_ARRAYS[mood];
  if (!arr) return;
  const current = moodQueryRotation.get(mood) || 0;
  moodQueryRotation.set(mood, (current + 1) % arr.length);
  console.log(`🔄 Mood rotation for '${mood}': now using query index ${(current + 1) % arr.length}`);
};

// SECTION 3A: Official channel whitelist and cover filter
const OFFICIAL_CHANNELS = new Set([
  "t-series", "zee music company", "sony music india", "saregama",
  "tips official", "yrf", "dharma", "speed records", "white hill music",
  "aditya music", "lahari music", "venus", "eros now", "saregama bengali",
  "eskay movies", "svf music", "atlantis music"
]);

const COVER_REJECT_PATTERNS = /\b(cover|karaoke|tribute|recreation|unplugged version by|remake|fan made|fan cover|piano cover|guitar cover|violin cover|lofi cover|slowed cover|reverb cover)\b/i;
const OFFICIAL_BOOST_PATTERNS = /\b(official|official video|official audio|official music video)\b/i;

// Quality boost patterns for high-quality sources
const QUALITY_BOOST_PATTERNS = {
  isMix: /mix|compilation|playlist|jukebox|lofi mix|chill mix|sad mix|focus mix|workout mix/i,
  isPlaylist: /playlist|album|collection/i,
  lowQualityKeywords: /remix|nightcore|phonk remix|ultra remix|trap remix|hardstyle/i,
};

const RECENT_SONG_MIN_FRESH = 5;
const SEARCH_MAX_PAGES = 2;
const SEARCH_RESULTS_PER_PAGE = 10;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const parseList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
};

const applyRecentSongFilter = (videos, recentSongs = [], dislikedVideos = []) => {
  if (!Array.isArray(videos) || videos.length === 0) return [];

  // Create lookup map of recent videos and their playedAt timestamps
  const recentMap = new Map();
  (recentSongs || []).forEach(entry => {
    if (entry?.videoId) {
      let ts = entry.ts || entry.playedAt || 0;
      if (ts && typeof ts.toMillis === "function") {
        ts = ts.toMillis();
      } else if (ts && typeof ts.toDate === "function") {
        ts = ts.toDate().getTime();
      } else if (ts && ts._seconds) {
        ts = ts._seconds * 1000;
      }
      recentMap.set(entry.videoId, ts);
    }
  });

  const dislikedSet = new Set(dislikedVideos || []);

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const filtered = [];

  videos.forEach(video => {
    if (!video?.videoId) return;
    
    // SECTION 1A: Drop disliked videos entirely
    if (dislikedSet.has(video.videoId)) return;
    
    // Default penalty is 1.0 (no penalty)
    video.recencyPenalty = 1.0;

    if (recentMap.has(video.videoId)) {
      const playedAt = recentMap.get(video.videoId);
      if (playedAt > 0) {
        const daysAgo = (now - playedAt) / ONE_DAY;
        
        // Played today (< 1 day): remove entirely
        if (daysAgo < 1) return;
        // Played 1 day ago (1-2 days): 0.3 multiplier
        else if (daysAgo < 2) video.recencyPenalty = 0.3;
        // Played 2 days ago (2-3 days): 0.6 multiplier
        else if (daysAgo < 3) video.recencyPenalty = 0.6;
        // Played 3 days ago (3-4 days): 0.8 multiplier
        else if (daysAgo < 4) video.recencyPenalty = 0.8;
      }
    }
    
    filtered.push(video);
  });

  return filtered;
};

const fetchSearchPages = async (query, maxPages = SEARCH_MAX_PAGES, maxResults = SEARCH_RESULTS_PER_PAGE, userId = null, type = "mood") => {
  const items = [];
  let nextPageToken;

  for (let page = 0; page < maxPages; page += 1) {
    if (!isQuotaSafe(100)) {
      console.log("🔴 QUOTA SAFE MODE ACTIVE — skipping YouTube search");
      const fallback = await getFallbackSongs(type, query, userId);
      throw { name: "QuotaSafeFallback", fallback };
    }

    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: query,
        type: "video",
        maxResults,
        pageToken: nextPageToken,
        videoCategoryId: "10",
        key: process.env.YOUTUBE_API_KEY,
        relevanceLanguage: "hi",
        regionCode: "IN",
      },
    });

    trackQuotaUsage(100);

    items.push(...(response.data.items || []));
    nextPageToken = response.data.nextPageToken;

    if (!nextPageToken) break;
  }

  return items;
};

const toWeight = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
};

const normalizeWeights = (weight1, weight2) => {
  const total = weight1 + weight2;
  if (total <= 0) return [50, 50];
  return [Math.round((weight1 / total) * 100), 100 - Math.round((weight1 / total) * 100)];
};

/**
 * Extract keywords from title and channel name
 * ✅ NEW: Keyword extraction for like/dislike learning
 */
const extractKeywords = (title, channelTitle) => {
  const text = `${title} ${channelTitle}`.toLowerCase();
  // Remove common words and split into tokens
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "is", "it", "to", "in", "of", "for", "with", "by",
    "hindi", "song", "video", "audio", "music", "official", "hd", "full", "version",
    "lyrics", "lyrical", "new", "latest", "best", "top", "most", "popular", "ft", "feat"
  ]);
  
  return text
    .split(/[\s\-_,\.:()]+/)
    .filter(word => word.length > 2 && !stopwords.has(word))
    .slice(0, 5); // Keep top 5 keywords
};

/**
 * ✅ IMPROVED: Dynamic mood query with like/dislike support
 */
const buildMoodQuery = (mood, likedKeywords, dislikedKeywords) => {
  const base = MOOD_KEYWORDS[mood];
  if (!base) return null;

  const parts = base.split(" ");
  const boosted = likedKeywords.filter((keyword) => !parts.includes(keyword));
  
  // Build query with boosts and exclusions
  const queryParts = [
    ...boosted.slice(0, 2), // Add up to 2 liked keywords
    ...parts // Base mood keywords
  ];
  
  // Add exclusions with minus operator
  const exclusions = dislikedKeywords
    .slice(0, 2)
    .map(keyword => `-${keyword}`)
    .join(" ");

  return [...new Set(queryParts)].join(" ") + (exclusions ? ` ${exclusions}` : "");
};

// ✅ FIXED: Session touch helper for inactivity TTL cleanup
const touchSession = (sessionId) => {
  const session = sessionQueues.get(sessionId);
  if (session) {
    session.lastAccess = Date.now();
  }
};

// ============================================================
// QUOTA-OPTIMIZED: CHEAP API SCORING (Step 3)
// ============================================================

/**
 * ✅ IMPROVED: Score videos using videos.list (CHEAP - ~1 unit each)
 * - Higher view count (>100k) → quality boost
 * - Higher like ratio → higher score
 * - Duration filter: 4-40 minutes (240s-2400s)
 * - Detects and boosts mix-type videos
 * - Fallback score: 1 for videos without stats
 */
const scoreVideos = async (videoIds) => {
  if (!videoIds || videoIds.length === 0) return [];

  if (!isQuotaSafe(1)) {
    console.log("🔴 Quota guard: skipping scoreVideos");
    return videoIds.map(id => ({ 
      videoId: id, 
      score: DEFAULT_FALLBACK_SCORE, 
      viewCount: 0,
      likeCount: 0, 
      duration: 300, 
      isMix: false, 
      title: "", 
      channelTitle: "" 
    }));
  }

  // SECTION 7C: Zero API mode — skip videos.list entirely
  if (quotaTracker.zeroApiMode) {
    console.log("🔴 ZERO API MODE: Skipping videos.list, assigning fallback scores");
    return videoIds.map(id => ({
      videoId: id, score: DEFAULT_FALLBACK_SCORE, viewCount: 0,
      likeCount: 0, duration: 300, isMix: false, title: "", channelTitle: ""
    }));
  }

  try {
    const now = Date.now();
    const uniqueIds = [...new Set(videoIds)];
    const cachedScored = [];
    const idsToFetch = [];

    uniqueIds.forEach((videoId) => {
      const cached = scoredVideosCache.get(videoId);
      if (cached && now - cached.timestamp < SCORE_CACHE_TTL) {
        cachedScored.push(cached.data);
      } else {
        idsToFetch.push(videoId);
      }
    });

    let fetchedScored = [];
    if (idsToFetch.length > 0) {
      const response = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "statistics,contentDetails,snippet",
          id: idsToFetch.join(","),
          key: process.env.YOUTUBE_API_KEY,
        },
      });

      fetchedScored = response.data.items.reduce((acc, video) => {
        const stats = video.statistics;
        const duration = video.contentDetails.duration;
        const title = video.snippet.title;
        const channelTitle = video.snippet.channelTitle;
        const durationSeconds = parseDuration(duration);

        const isSingle = durationSeconds >= SINGLE_MIN && durationSeconds <= SINGLE_MAX;
        const isPlaylistVid = durationSeconds >= PLAYLIST_MIN && durationSeconds <= PLAYLIST_MAX;
        if (!isSingle && !isPlaylistVid) return acc;

        // SECTION 3A: Cover song rejection
        if (COVER_REJECT_PATTERNS.test(title)) {
          // Allow "sung by" only from official channels
          const channelLower = (channelTitle || "").toLowerCase();
          if (!OFFICIAL_CHANNELS.has(channelLower)) {
            return acc; // Reject cover/karaoke
          }
        }

        const viewCount = BigInt(stats.viewCount || 0);
        const likeCount = BigInt(stats.likeCount || 0);
        const logViews = viewCount > 0 ? Math.log10(Number(viewCount)) : 0;
        const likeRatio = viewCount > 0 ? Number(likeCount) / Number(viewCount) : 0;
        let score = logViews * 0.5 + likeRatio * 1000 * 0.3;

        const viewBoost = viewCount > BigInt(VIEW_COUNT_BOOST_THRESHOLD) ? 0.3 : 0;
        const isMix = QUALITY_BOOST_PATTERNS.isMix.test(title);
        const mixBoost = isMix ? 0.4 : 0;
        const isLowQuality = QUALITY_BOOST_PATTERNS.lowQualityKeywords.test(title);
        const qualityPenalty = isLowQuality ? 0.3 : 0;

        // SECTION 3A: Official channel and title boost
        const channelLower = (channelTitle || "").toLowerCase();
        const officialChannelBoost = OFFICIAL_CHANNELS.has(channelLower) ? 0.5 : 0;
        const officialTitleBoost = OFFICIAL_BOOST_PATTERNS.test(title) ? 0.3 : 0;

        score = score + viewBoost + mixBoost - qualityPenalty + officialChannelBoost + officialTitleBoost;
        score = Math.max(score, 0.1);

        const scoreData = {
          videoId: video.id, score,
          viewCount: Number(viewCount), likeCount: Number(likeCount),
          duration: durationSeconds, isMix, title, channelTitle,
        };

        scoredVideosCache.set(video.id, { data: scoreData, timestamp: now });
        acc.push(scoreData);
        return acc;
      }, []);
    }

    return [...cachedScored, ...fetchedScored];
  } catch (error) {
    console.error("❌ Video scoring failed:", error.message);
    return [];
  }
};

/**
 * Parse ISO 8601 duration to seconds
 */
const parseDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);

  return hours * 3600 + minutes * 60 + seconds;
};

// ============================================================
// QUOTA-OPTIMIZED: SEARCH (Step 1 + 2 - Only when necessary)
// ============================================================

/**
 * ✅ IMPROVED: Multi-query search strategy for better quality
 * Uses multiple search patterns per mood for diversity:
 * - songs, playlist, mix, jukebox variants
 * Merges and deduplicates results
 */
const performMultiQuerySearch = async (mood, query, isPersonalized = false, artists = []) => {
  let allVideos = [];
  const videoIdSet = new Set();
  const maxResultsPerFetch = SEARCH_RESULTS_PER_PAGE;

  if (isPersonalized && artists.length > 0) {
    console.log("Artists:", artists);
    // FIX 3: Fair distribution across selected artists
    // FIX 4: Parallel fetch (Promise.all over artists)
    // FIX 1: Remove mood keywords, just use `${artist} songs` and `${artist} playlist`
    const quotaPerArtist = Math.max(1, Math.floor(20 / artists.length));

    const artistPromises = artists.map(async (artist) => {
      return await fetchArtistSongs(artist, maxResultsPerFetch);
    });

    const resultsArray = await Promise.all(artistPromises);
    console.log("Fetched per artist:", resultsArray.map(r => r.length));
    const extraPool = [];

    // FIX 3: SMART QUOTA WITH FALLBACK FILL
    resultsArray.forEach(videos => {
      const topResults = videos.slice(0, quotaPerArtist);
      const leftovers = videos.slice(quotaPerArtist);

      topResults.forEach(v => {
        allVideos.push(v);
      });

      leftovers.forEach(v => {
        extraPool.push(v);
      });
    });

    // Fill remaining slots up to 20
    let remainingSlots = 20 - allVideos.length;
    let extraIdx = 0;
    while (remainingSlots > 0 && extraIdx < extraPool.length) {
      allVideos.push(extraPool[extraIdx]);
      remainingSlots--;
      extraIdx++;
    }
    
  } else {
    // Generic mode multi-query
    const searchQueries = [
      `${query} songs`,
      `${query} hits`,
      `${query} mix`,
    ];

    const searchPromises = searchQueries.map(q =>
      fetchSearchPages(q, SEARCH_MAX_PAGES, maxResultsPerFetch).catch(err => {
        console.error(`❌ Multi-query search failed for "${q}":`, err.message);
        return [];
      })
    );

    const responses = await Promise.all(searchPromises);
    responses.forEach((items) => {
      items.forEach((item) => {
        const videoId = item.id.videoId;
        if (!videoIdSet.has(videoId)) {
          videoIdSet.add(videoId);
          allVideos.push({
            videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium.url,
          });
        }
      });
    });
  }

  // FIX 8: OPTIONAL CLEAN DEDUP AT FINAL STAGE
  const uniqueMap = new Map();
  allVideos.forEach(v => {
    if (!uniqueMap.has(v.videoId)) {
      uniqueMap.set(v.videoId, v);
    }
  });
  
  const finalVideos = Array.from(uniqueMap.values());
  console.log("Final count:", finalVideos.length);

  return finalVideos;
};

/**
 * EXPENSIVE: Only call on initial mood selection or empty queue
 * Uses aggressive caching (12 min TTL)
 * ✅ IMPROVED: Multi-query search for better results
 */
const searchMoodVideos = async (mood, query, options = { allowSearch: true, isPersonalized: false, artists: [] }) => {
  // FIX 7: SAFE CACHE KEY
  const safeArtistsOpts = Array.isArray(options.artists) ? options.artists : [];
  const cacheKey = options.isPersonalized ? `pers:${[...safeArtistsOpts].sort().join(",")}` : mood;
  const allowSearch = options.allowSearch !== false;

  console.log("🧠 SEARCH CHECK:", mood);
  console.log("📦 CACHE SIZE:", searchCache.size);

  // Check cache first (Step 2: Aggressive caching)
  if (searchCache.has(cacheKey)) {
    const { data, timestamp } = searchCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log("📦 CACHE HIT:", mood);
      return { videos: data, source: "cache" };
    }
  }

  console.log("📦 CACHE MISS:", mood);
  if (!allowSearch) {
    // ✅ FIXED: Quota protection path for prefetch
    console.log("🚫 SEARCH BLOCKED (PREFETCH)");
    return { videos: [], source: "blocked" };
  }

  // ✅ FIXED: lock per mood to prevent stampede
  if (pendingSearches.has(cacheKey)) {
    await pendingSearches.get(cacheKey);
    if (searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log("📦 CACHE HIT:", mood);
        return { videos: cached.data, source: "cache" };
      }
    }
  }

  const searchPromise = (async () => {
    console.log("🔥 SEARCH EXECUTED:", mood);

    try {
      // ✅ NEW: Multi-query search instead of single query
      const videos = await performMultiQuerySearch(mood, query, options.isPersonalized, options.artists);

      // SECTION 4B: Populate Level 0 sessionSongPool
      if (!sessionSongPool.has(mood)) {
        sessionSongPool.set(mood, []);
      }
      const pool = sessionSongPool.get(mood);
      videos.forEach(v => {
        if (!pool.some(pv => pv.videoId === v.videoId)) {
          pool.push(v);
        }
      });
      // Keep pool size manageable
      if (pool.length > 200) {
        sessionSongPool.set(mood, pool.slice(-200));
      }

      // Cache the search result
      searchCache.set(cacheKey, {
        data: videos,
        timestamp: Date.now(),
      });

      console.log("📊 RESULTS:", videos.length);
      return { videos, source: "fresh" };
    } catch (error) {
      console.error("❌ Search failed:", error.message);
      throw error;
    } finally {
      pendingSearches.delete(cacheKey);
    }
  })();

  pendingSearches.set(cacheKey, searchPromise);
  return searchPromise;
};

// ============================================================
// WEIGHTED RANDOM SELECTION (Step 4 - No extra API)
// ============================================================

/**
 * Weighted random selection based on scores
 * Higher score → higher chance, but still random
 */
const weightedRandomSelect = (scoredItems, count = 1) => {
  if (scoredItems.length === 0) return [];
  if (count >= scoredItems.length) return scoredItems;

  const selected = [];
  const available = [...scoredItems];

  for (let i = 0; i < count; i++) {
    const totalScore = available.reduce((sum, item) => sum + item.score, 0);

    let random = Math.random() * totalScore;
    let selected_item = null;

    for (const item of available) {
      random -= item.score;
      if (random <= 0) {
        selected_item = item;
        break;
      }
    }

    if (!selected_item) selected_item = available[0];

    selected.push(selected_item);
    available.splice(available.indexOf(selected_item), 1);
  }

  return selected;
};

// ============================================================
// SESSION QUEUE MANAGEMENT (Step 5 - Core)
// ============================================================

/**
 * Initialize or get session queue
 * ✅ IMPROVED: Added preference tracking for likes/dislikes
 */
const getOrCreateSession = (sessionId) => {
  if (!sessionQueues.has(sessionId)) {
    sessionQueues.set(sessionId, {
      videos: [],
      scores: {},
      queued: [],
      mood: null,
      // ✅ NEW: Track user preferences per session
      likedKeywords: [],
      dislikedKeywords: [],
      recentArtists: [], // SECTION 6: Track last 3 artists for diversification
      isPersonalized: false,
      selectedArtists: [],
      // ✅ FIXED: track last access for TTL cleanup
      lastAccess: Date.now(),
    });
    playedHistory.set(sessionId, new Set());
  }
  touchSession(sessionId);
  return sessionQueues.get(sessionId);
};

/**
 * ✅ IMPROVED: Ensure scored schema for all queued videos
 * NEW: Falls back to DEFAULT_FALLBACK_SCORE for videos without stats
 */
const toScoredQueue = async (videos) => {
  if (!videos || videos.length === 0) return [];
  const scoreMap = new Map();
  const scores = await scoreVideos(videos.map((video) => video.videoId));
  scores.forEach((scoreData) => {
    scoreMap.set(scoreData.videoId, scoreData);
  });

  // ✅ IMPROVED: Never drop videos - assign fallback score if missing
  // SECTION 2: Apply recencyPenalty to the final score
  return videos
    .map((video) => {
      const penalty = video.recencyPenalty || 1.0;
      const scoreData = scoreMap.get(video.videoId);
      if (!scoreData) {
        // ✅ NEW: Fallback score instead of dropping
        return {
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          thumbnail: video.thumbnail,
          score: DEFAULT_FALLBACK_SCORE * penalty,
          viewCount: 0,
          likeCount: 0,
          duration: 0,
          isMix: false,
        };
      }
      return {
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnail: video.thumbnail,
        score: scoreData.score * penalty,
        viewCount: scoreData.viewCount,
        likeCount: scoreData.likeCount,
        duration: scoreData.duration,
        isMix: scoreData.isMix || false,
      };
    });
};

// ✅ FIXED: fallback from existing cache without search + dedup
const fallbackFromCache = async (mood, played) => {
  if (!searchCache.has(mood)) return [];
  const { data } = searchCache.get(mood);
  const scored = await toScoredQueue(data);
  const unplayed = scored.filter((item) => !played.has(item.videoId));
  const result = unplayed.length > 0 ? unplayed : scored;
  // Hard dedup guarantee
  const dedupMap = new Map();
  result.forEach(v => { if (!dedupMap.has(v.videoId)) dedupMap.set(v.videoId, v); });
  return Array.from(dedupMap.values());
};

/**
 * Refill queue with newly fetched videos
 * ✅ IMPROVED: Uses likes/dislikes for dynamic query rebuilding
 * ✅ IMPROVED: Better queue safety with multiple fallback strategies
 */
const refillSessionQueue = async (sessionId, mood, options = { allowSearch: true }) => {
  console.log(`📋 REFILL: Preparing queue for session "${sessionId}" (mood: ${mood})`);

  const session = getOrCreateSession(sessionId);
  const played = playedHistory.get(sessionId) || new Set();
  const allowSearch = options.allowSearch !== false;

  // ✅ IMPROVED: Use session preferences for dynamic query
  const query = buildMoodQuery(mood, session.likedKeywords, session.dislikedKeywords) 
    || MOOD_KEYWORDS[mood];

  // Search only if cache is empty OR cache is expired
  let videos = [];
  // FIX 7: SAFE CACHE KEY
  const safeArtistsSess = Array.isArray(session.selectedArtists) ? session.selectedArtists : [];
  const cacheKey = session.isPersonalized ? `pers:${[...safeArtistsSess].sort().join(",")}` : mood;

  const searchOptions = { allowSearch, isPersonalized: session.isPersonalized, artists: session.selectedArtists };

  if (searchCache.has(cacheKey)) {
    const { data, timestamp } = searchCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      videos = data;
      console.log(`✅ Using cached videos for queue refill`);
    } else {
      if (!allowSearch) {
        // ✅ FIXED: prefetch mode must not search on expiry
        console.log("⚠️ PREFETCH SKIPPED: cache expired, avoiding quota hit");
        videos = [];
      } else {
        // Cache expired, search again
        console.log(`⏰ Cache expired, searching again...`);
        const result = await searchMoodVideos(mood, query, searchOptions);
        videos = result.videos;
      }
    }
  } else {
    if (!allowSearch) {
      // ✅ FIXED: prefetch mode must not search on cache miss
      console.log("⚠️ PREFETCH SKIPPED: cache miss, avoiding quota hit");
      videos = [];
    } else {
      // First time, search
      const result = await searchMoodVideos(mood, query, searchOptions);
      videos = result.videos;
    }
  }

  // ✅ IMPROVED: Score with metadata merge
  let scored = await toScoredQueue(videos);

  // Filter out already-played videos
  let unplayed = scored.filter((v) => !played.has(v.videoId));

  if (unplayed.length === 0) {
    // ✅ IMPROVED: Multi-level fallback strategy
    console.log(`🔄 All videos played, attempting recovery...`);
    
    if (scored.length > 0) {
      // Level 1: Reset history and reuse all scored videos
      console.log(`📌 Level 1: Resetting play history`);
      played.clear();
      session.videos = scored;
    } else if (searchCache.has(cacheKey)) {
      // Level 2: Fallback to cache without scoring
      console.log(`📌 Level 2: Using unscored cache fallback`);
      const cacheData = searchCache.get(cacheKey).data;
      session.videos = cacheData.map(v => ({
        ...v,
        score: DEFAULT_FALLBACK_SCORE,
        viewCount: 0,
        likeCount: 0,
        duration: 0,
      }));
    } else {
      // Level 3: Search with forced allowSearch
      console.log(`📌 Level 3: Force search to recover queue`);
      const result = await searchMoodVideos(mood, query, { ...searchOptions, allowSearch: true });
      session.videos = await toScoredQueue(result.videos);
    }
  } else {
    session.videos = unplayed;
  }

  // FIX 5: OPTIONAL FUTURE HOOK (LIGHTWEIGHT)
  const ARTIST_WEIGHTS = {
    "Arijit Singh": 1.2,
    "Kishore Kumar": 1.0
  };

  session.videos.forEach(v => {
    let weight = 1.0;
    if (v.title && v.channelTitle) {
      Object.keys(ARTIST_WEIGHTS).forEach(artistName => {
        const nameLower = artistName.toLowerCase();
        // FIX 4: FIX ARTIST MATCHING (REMOVE FALSE POSITIVES)
        if (v.channelTitle && v.channelTitle.toLowerCase().includes(nameLower)) {
          weight = Math.max(weight, ARTIST_WEIGHTS[artistName]);
        }
      });
    }
    v.score = v.score * weight;
  });

  // OPTIONAL RANKING: Soft rank boost for Personalized Mode based on mood
  if (session.isPersonalized && mood) {
    const moodTokens = MOOD_KEYWORDS[mood] ? MOOD_KEYWORDS[mood].split(" ") : [];
    if (mood === "sad") moodTokens.push("sad", "emotional", "lofi", "slow");
    if (mood === "chill") moodTokens.push("chill", "lofi", "relax", "calm", "slow");
    if (mood === "hype") moodTokens.push("hype", "party", "bass", "workout", "remix");
    if (mood === "focus") moodTokens.push("focus", "study", "instrumental", "deep", "bgm");

    session.videos.forEach(v => {
      // FIX 5: PREVENT UNDEFINED CRASH (TITLE SAFETY)
      const titleLower = (v.title || "").toLowerCase();
      let matchCount = 0;
      moodTokens.forEach(t => {
        if (titleLower.includes(t)) matchCount++;
      });
      if (matchCount > 0) {
        // FIX 3: SAFE WEIGHTED SCORING
        const moodScore = matchCount; 
        const baseScore = v.score || 0;
        const moodBoost = moodScore || 0;
        v.score = (baseScore * 0.9) + (moodBoost * 0.1);
      }
    });
  }

  // FIX 6: FIX DURATION FILTER
  const singles = session.videos.filter(v => v.duration >= SINGLE_MIN && v.duration <= SINGLE_MAX).sort((a,b) => b.score - a.score);
  const playlists = session.videos.filter(v => v.duration >= PLAYLIST_MIN && v.duration <= PLAYLIST_MAX).sort((a,b) => b.score - a.score);
  const others = session.videos.filter(v => (v.duration > SINGLE_MAX && v.duration < PLAYLIST_MIN) || v.duration < SINGLE_MIN || v.duration > PLAYLIST_MAX).sort((a,b) => b.score - a.score);
  
  const totalSlots = session.videos.length;
  // target playlists ≈ 30-50%
  let targetPlaylists = Math.floor(totalSlots * 0.4);
  let targetSingles = totalSlots - targetPlaylists;
  
  if (playlists.length < targetPlaylists) {
    targetPlaylists = playlists.length;
    targetSingles = totalSlots - targetPlaylists;
  }
  if (singles.length < targetSingles) {
    targetSingles = singles.length;
    targetPlaylists = Math.min(playlists.length, totalSlots - targetSingles);
  }

  const adaptiveMix = [];
  let s = 0, p = 0;
  while (s < targetSingles || p < targetPlaylists) {
    if (s < targetSingles && s < singles.length) adaptiveMix.push(singles[s++]);
    if (p < targetPlaylists && p < playlists.length) adaptiveMix.push(playlists[p++]);
  }
  
  // Fill remaining slots from best remaining pool
  const remainingMixed = [
    ...singles.slice(targetSingles), 
    ...playlists.slice(targetPlaylists), 
    ...others
  ].sort((a,b) => b.score - a.score);
  
  adaptiveMix.push(...remainingMixed);

  session.videos = adaptiveMix.length > 0 ? adaptiveMix : session.videos;

  // Hard dedup guarantee on final queue
  const queueDedupMap = new Map();
  session.videos.forEach(v => { if (!queueDedupMap.has(v.videoId)) queueDedupMap.set(v.videoId, v); });
  session.videos = Array.from(queueDedupMap.values());

  // Store scores for quick access
  session.scores = {};
  session.videos.forEach((v) => {
    session.scores[v.videoId] = v.score;
  });

  session.mood = mood;
  touchSession(sessionId);
  console.log(`✅ Queue refilled: ${session.videos.length} available videos`);
};

// ============================================================
// NEXT SONG SELECTION (Smart + Cheap)
// ============================================================

/**
 * Get next song from queue
 * Refills if queue < 5
 */
const getNextSong = async (sessionId, mood) => {
  const session = getOrCreateSession(sessionId);
  const played = playedHistory.get(sessionId);
  const effectiveMood = session.mood || mood || DEFAULT_MOOD;
  session.mood = effectiveMood;
  touchSession(sessionId);

  console.log("🧠 SESSION:", sessionId);
  console.log("🎧 SESSION MOOD:", session.mood);
  console.log("📊 QUEUE SIZE:", session.videos.length);

  // Refill if necessary (ONLY refill, NOT search)
  if (session.videos.length < QUEUE_MIN_SIZE) {
    await refillSessionQueue(sessionId, effectiveMood, { allowSearch: true });
  }

  if (session.videos.length === 0) {
    console.log(`❌ No videos available`);
    // ✅ FIXED: fallback queue from existing cache only
    console.log("⚠️ EMPTY QUEUE → using fallback cache");
    const fallback = await fallbackFromCache(effectiveMood, played);
    session.videos = fallback;
    if (session.videos.length === 0) return null;
  }

  // SECTION 6: Artist Diversification
  let selected = null;
  const last2Artists = session.recentArtists.slice(-2);
  const sameArtistTwice = last2Artists.length === 2 && last2Artists[0] === last2Artists[1];
  
  if (sameArtistTwice) {
    const skipArtist = last2Artists[0];
    const diverseVideos = session.videos.filter(v => {
      const art = (v.sourceArtist || v.channelTitle || "").toLowerCase();
      return art !== skipArtist;
    });
    
    if (diverseVideos.length > 0) {
      selected = weightedRandomSelect(diverseVideos, 1)[0];
    }
  }
  
  if (!selected) {
    selected = weightedRandomSelect(session.videos, 1)[0];
  }

  // Remove from available
  session.videos = session.videos.filter((v) => v.videoId !== selected.videoId);

  // Track as played
  played.add(selected.videoId);
  if (played.size > MAX_PLAYED_HISTORY) {
    const first = Array.from(played)[0];
    played.delete(first);
  }

  // Track artist for diversification
  const selectedArtist = (selected.sourceArtist || selected.channelTitle || "").toLowerCase();
  session.recentArtists.push(selectedArtist);
  if (session.recentArtists.length > 3) {
    session.recentArtists.shift();
  }

  console.log("⏭️ NEXT FROM QUEUE:", selected.videoId);
  return selected;
};

// ============================================================
// PREFETCH (Step 6 - No search, reuse cached)
// ============================================================

/**
 * Called at ~75% playback
 * Ensures queue stays full WITHOUT extra searches
 */
const prefetchNext = async (sessionId, mood) => {
  const session = getOrCreateSession(sessionId);
  const effectiveMood = session.mood || mood || DEFAULT_MOOD;
  session.mood = effectiveMood;
  touchSession(sessionId);

  console.log(`📡 PREFETCH: Checking queue for session "${sessionId}"`);
  console.log("⚡ PREFETCH CHECK:", session.videos.length);

  // Only refill if queue is low
  if (session.videos.length < QUEUE_MIN_SIZE) {
    console.log("⚡ PREFETCH REFILL TRIGGERED");
    console.log(
      `📡 Queue low (${session.videos.length} videos), refilling from cache...`
    );
    await refillSessionQueue(sessionId, effectiveMood, { allowSearch: false });
  } else {
    console.log(`✅ Queue full (${session.videos.length} videos), no action needed`);
  }

  return {
    queueSize: session.videos.length,
    needsRefill: session.videos.length < QUEUE_MIN_SIZE,
  };
};

const fetchSongsForMood = async (mood, query, maxResults = 15) => {
  const result = await searchMoodVideos(mood, query);
  return result.videos;
};
const weightedInterleave = (list1, list2, weight1, weight2, total = 12) => {
  const [normalizedWeight1, normalizedWeight2] = normalizeWeights(weight1, weight2);
  const target1 = Math.round((total * normalizedWeight1) / 100);
  const target2 = total - target1;

  const selected1 = list1.slice(0, target1);
  const selected2 = list2.slice(0, target2);
  const merged = [];
  let i = 0;
  let j = 0;

  // Preserve intended ratio while interleaving in a natural pattern.
  while (i < selected1.length || j < selected2.length) {
    const ratioA = selected1.length ? i / selected1.length : 1;
    const ratioB = selected2.length ? j / selected2.length : 1;

    if ((ratioA <= ratioB && i < selected1.length) || j >= selected2.length) {
      merged.push(selected1[i]);
      i += 1;
    } else if (j < selected2.length) {
      merged.push(selected2[j]);
      j += 1;
    }
  }

  // Light shuffle within local windows to avoid rigid ordering.
  for (let index = 0; index < merged.length - 1; index += 2) {
    if (Math.random() > 0.6) {
      const temp = merged[index];
      merged[index] = merged[index + 1];
      merged[index + 1] = temp;
    }
  }

  return merged;
};

// SECTION 1A: Helper to load user preferences from Firestore into session
const loadUserPreferences = async (userId, session) => {
  if (!userId) return;
  try {
    const { getFirestore } = require("firebase-admin/firestore");
    const db = getFirestore();
    const prefRef = db.collection("users").doc(userId).collection("preferences");
    
    const [likedDoc, dislikedDoc, dislikedVidDoc] = await Promise.all([
      prefRef.doc("likedKeywords").get(),
      prefRef.doc("dislikedKeywords").get(),
      prefRef.doc("dislikedVideos").get()
    ]);

    session.likedKeywords = [];
    if (likedDoc.exists) {
      const kwList = likedDoc.data().keywords || [];
      session.likedKeywords = kwList.map(k => k.keyword).slice(0, 10);
    }
    
    session.dislikedKeywords = [];
    if (dislikedDoc.exists) {
      const kwList = dislikedDoc.data().keywords || [];
      session.dislikedKeywords = kwList.map(k => k.keyword).slice(0, 10);
    }

    session.dislikedVideos = [];
    if (dislikedVidDoc.exists) {
      session.dislikedVideos = dislikedVidDoc.data().videos || [];
    }
    
    console.log(`✅ Loaded preferences for user ${userId}: ${session.likedKeywords.length} liked, ${session.dislikedKeywords.length} disliked keywords`);
  } catch (e) {
    console.error("❌ Failed to load user preferences:", e.message);
  }
};

// ============================================================
// ENDPOINT 1: Get initial songs for mood (Step 1)
// ============================================================
// Triggered: on mood selection (once per session)
// Behavior: Searches if not cached, otherwise uses cache
router.get("/songs", async (req, res) => {
  try {
    const {
      mood,
      mood1,
      mood2,
      weight1,
      weight2,
      likedKeywords,
      dislikedKeywords,
      sessionId,
      userId,
      isPersonalized,
      selectedArtists,
    } = req.query;

    const liked = parseList(likedKeywords);
    const disliked = parseList(dislikedKeywords);
    const artists = parseList(selectedArtists);
    const isPers = isPersonalized === "true" || isPersonalized === true;

    const primaryMood = mood1 || mood || DEFAULT_MOOD;
    const secondaryMood = mood2 || null;

    if (!MOOD_KEYWORDS[primaryMood]) {
      return res.status(400).json({ error: "Invalid primary mood" });
    }

    const query1 = buildMoodQuery(primaryMood, liked, disliked);
    if (!query1) {
      return res.status(400).json({ error: "Invalid primary mood query" });
    }

    // Initialize session
    if (sessionId) {
      const session = getOrCreateSession(sessionId);
      session.isPersonalized = isPers;
      session.selectedArtists = artists;
      
      // SECTION 1A: Load preferences from Firestore on session start
      if (userId && (!session.preferencesLoaded)) {
        await loadUserPreferences(userId, session);
        session.preferencesLoaded = true;
      }
      
      touchSession(sessionId);
      console.log("🧠 SESSION:", sessionId);
    }

    const searchOpts = { allowSearch: true, isPersonalized: isPers, artists: artists };
    const recentSongs = await getRecentSongs(userId);
    const dislikedVids = (sessionId && sessionQueues.has(sessionId)) ? sessionQueues.get(sessionId).dislikedVideos : [];

    if (!secondaryMood) {
      const result = await searchMoodVideos(primaryMood, query1, searchOpts);
      const videos = applyRecentSongFilter(result.videos, recentSongs, dislikedVids);
      // ✅ FIXED: /songs now uses scoring pipeline before queue store
      const scoredVideos = await toScoredQueue(videos);

      // Setup queue for this mood
      if (sessionId) {
        const session = getOrCreateSession(sessionId);
        session.videos = scoredVideos;
        session.mood = primaryMood;
        touchSession(sessionId);
        console.log("🎧 SESSION MOOD:", session.mood);
        console.log("📊 QUEUE SIZE:", session.videos.length);
      }

      // Hard dedup guarantee
      const songsDedupMap = new Map();
      scoredVideos.slice(0, 15).forEach(v => { if (!songsDedupMap.has(v.videoId)) songsDedupMap.set(v.videoId, v); });

      const responseSongs = Array.from(songsDedupMap.values());

      if (userId) {
        runNonBlocking(() => addRecentSongs(userId, responseSongs.map(song => ({
          videoId: song.videoId,
          title: song.title,
          channelTitle: song.channelTitle,
          thumbnail: song.thumbnail,
          playedAt: Date.now()
        }))));
      }

      return res.json({
        songs: responseSongs,
        blend: { mood1: primaryMood, weight1: 100, mood2: null, weight2: 0 },
        meta: {
          source: result.source,
          quotaSafe: true,
          cacheHit: result.source === "cache",
        },
      });
    }

    if (!MOOD_KEYWORDS[secondaryMood]) {
      return res.status(400).json({ error: "Invalid secondary mood" });
    }

    const query2 = buildMoodQuery(secondaryMood, liked, disliked);
    const resolvedWeight1 = toWeight(weight1, 50);
    const resolvedWeight2 = toWeight(weight2, 50);

    // SECTION 7B: Blend Cache logic
    const blendKeyParts = [
      { mood: primaryMood, weight: resolvedWeight1 },
      { mood: secondaryMood, weight: resolvedWeight2 }
    ].sort((a, b) => a.mood.localeCompare(b.mood));
    const blendKey = `${blendKeyParts[0].mood}_${blendKeyParts[0].weight}_${blendKeyParts[1].mood}_${blendKeyParts[1].weight}`;

    let scoredBlended = [];
    let isBlendCacheHit = false;

    if (blendCache.has(blendKey) && Date.now() - blendCache.get(blendKey).timestamp < CACHE_TTL) {
      console.log(`📦 BLEND CACHE HIT: ${blendKey}`);
      scoredBlended = blendCache.get(blendKey).videos;
      isBlendCacheHit = true;
    } else {
      // Both searches will use cache if available (aggressive caching)
      const [result1, result2] = await Promise.all([
        searchMoodVideos(primaryMood, query1, searchOpts),
        searchMoodVideos(secondaryMood, query2, searchOpts),
      ]);

      const blended = weightedInterleave(
        result1.videos,
        result2.videos,
        resolvedWeight1,
        resolvedWeight2,
        12
      );
      const filteredBlended = applyRecentSongFilter(blended, recentSongs, dislikedVids);
      // ✅ FIXED: /songs blend mode also scored before queue storage
      scoredBlended = await toScoredQueue(filteredBlended);

      blendCache.set(blendKey, {
        videos: scoredBlended,
        timestamp: Date.now()
      });
    }

    if (sessionId) {
      const session = getOrCreateSession(sessionId);
      session.videos = scoredBlended;
      session.mood = primaryMood;
      touchSession(sessionId);
      console.log("🎧 SESSION MOOD:", session.mood);
      console.log("📊 QUEUE SIZE:", session.videos.length);
    }

    // Hard dedup guarantee
    const blendDedupMap = new Map();
    scoredBlended.forEach(v => { if (!blendDedupMap.has(v.videoId)) blendDedupMap.set(v.videoId, v); });

    const responseSongs = Array.from(blendDedupMap.values());

    if (userId) {
      runNonBlocking(() => addRecentSongs(userId, responseSongs.map(song => ({
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail,
        playedAt: Date.now()
      }))));
    }

    return res.json({
      songs: responseSongs,
      blend: {
        mood1: primaryMood,
        mood2: secondaryMood,
        weight1: normalizeWeights(resolvedWeight1, resolvedWeight2)[0],
        weight2: normalizeWeights(resolvedWeight1, resolvedWeight2)[1],
      },
      meta: {
        source: result1.source === "cache" && result2.source === "cache" ? "cache" : "fresh",
        quotaSafe: true,
        cacheHits: { mood1: result1.source === "cache", mood2: result2.source === "cache" },
      },
    });
  } catch (error) {
    if (error.name === "QuotaSafeFallback") {
      return res.json({
        songs: error.fallback.songs,
        meta: {
          source: error.fallback.source,
          quotaSafeMode: true,
          quotaSafe: true
        }
      });
    }
    console.error("❌ Error in /songs:", error.message);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// ============================================================
// ENDPOINT 2: Next song from queue (Smart Auto-DJ)
// ============================================================
// Triggered: When user skips or song ends
// Behavior: Uses weighted random from cached pool
//           Refills queue only if < 5 songs left
router.get("/next-song", async (req, res) => {
  try {
    const { sessionId, userId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = getOrCreateSession(sessionId);
    // ✅ FIXED: prevent session/mood drift by trusting stored session mood
    if (!session.mood) {
      return res.status(400).json({ error: "session mood not initialized; call /songs first" });
    }

    const nextSong = await getNextSong(sessionId, session.mood);

    if (!nextSong) {
      return res.status(500).json({ error: "Could not fetch song" });
    }

    if (userId) {
      runNonBlocking(() => addRecentSongs(userId, [{
        videoId: nextSong.videoId,
        title: nextSong.title,
        channelTitle: nextSong.channelTitle,
        thumbnail: nextSong.thumbnail,
        playedAt: Date.now()
      }]));
    }

    return res.json({
      song: {
        videoId: nextSong.videoId,
        title: nextSong.title,
        channelTitle: nextSong.channelTitle,
        thumbnail: nextSong.thumbnail,
        duration: nextSong.duration,
      },
      meta: {
        source: "queue",
        quotaSafe: true,
        queueStrategy: "weighted_random",
      },
    });
  } catch (error) {
    console.error("❌ Error in /next-song:", error.message);
    return res.status(500).json({ error: "Failed to get next song" });
  }
});

// ============================================================
// ENDPOINT 3: Prefetch (triggered at ~75% playback)
// ============================================================
// Behavior: Ensures queue stays stocked WITHOUT searching
router.post("/prefetch-next", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = getOrCreateSession(sessionId);
    // ✅ FIXED: prevent session/mood drift by trusting stored session mood
    if (!session.mood) {
      return res.status(400).json({ error: "session mood not initialized; call /songs first" });
    }

    const result = await prefetchNext(sessionId, session.mood);

    return res.json({
      status: "prefetch_queued",
      queueSize: result.queueSize,
      needsRefill: result.needsRefill,
      meta: {
        source: "prefetch",
        quotaSafe: true,
        noSearchNeeded: !result.needsRefill,
      },
    });
  } catch (error) {
    console.error("❌ Error in /prefetch-next:", error.message);
    return res.status(500).json({ error: "Prefetch failed" });
  }
});

// ============================================================
// ENDPOINT 4: Get queue status (diagnostics)
// ============================================================
router.get("/queue-status", (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = sessionQueues.get(sessionId) || getOrCreateSession(sessionId);
    const played = playedHistory.get(sessionId) || new Set();
    touchSession(sessionId);

    return res.json({
      sessionId,
      queueSize: session.videos.length,
      playedCount: played.size,
      currentMood: session.mood,
      meta: {
        quotaSafe: true,
        cacheSize: searchCache.size,
        activeSessions: sessionQueues.size,
      },
    });
  } catch (error) {
    console.error("❌ Error in /queue-status:", error.message);
    return res.status(500).json({ error: "Status check failed" });
  }
});

// ============================================================
// ENDPOINT 7: Like handler (Learning system)
// ============================================================
// ✅ NEW: Implement like behavior with bias for future selections
router.post("/like", async (req, res) => {
  try {
    const { sessionId, videoId, title, channelTitle, thumbnail, userId } = req.body;

    if (!sessionId || !videoId) {
      return res.status(400).json({ error: "sessionId and videoId required" });
    }

    const session = getOrCreateSession(sessionId);
    
    const keywords = extractKeywords(title || "", channelTitle || "");
    
    keywords.forEach(keyword => {
      if (!session.likedKeywords.includes(keyword)) {
        session.likedKeywords.push(keyword);
      }
    });

    session.likedKeywords = session.likedKeywords.slice(0, 10);

    // SECTION 1C: Immediately boost songs in current queue sharing keywords
    let boostedCount = 0;
    session.videos.forEach(video => {
      const videoKeywords = extractKeywords(video.title || "", video.channelTitle || "");
      const commonKeywords = videoKeywords.filter(k => keywords.includes(k));
      if (commonKeywords.length > 0) {
        video.score = (video.score || 1) * 1.3;
        boostedCount++;
      }
    });
    
    touchSession(sessionId);

    console.log(`❤️ LIKE: ${videoId} - Keywords: [${keywords.join(", ")}], Boosted ${boostedCount} queue songs`);

    // SECTION 1A: Persist liked artist + keywords to Firestore (non-blocking)
    if (userId) {
      runNonBlocking(async () => {
        try {
          const { getFirestore } = require("firebase-admin/firestore");
          const db = getFirestore();
          const prefRef = db.collection("users").doc(userId).collection("preferences");
          
          // Save liked artist
          if (channelTitle) {
            const artistDoc = await prefRef.doc("likedArtists").get();
            const artists = artistDoc.exists ? (artistDoc.data().artists || []) : [];
            const existing = artists.find(a => a.name === channelTitle);
            if (existing) {
              existing.count = (existing.count || 0) + 1;
              existing.lastUpdated = Date.now();
            } else {
              artists.push({ name: channelTitle, count: 1, lastUpdated: Date.now() });
            }
            await prefRef.doc("likedArtists").set({ artists: artists.slice(0, 20) });
          }
          
          // Save liked keywords
          const kwDoc = await prefRef.doc("likedKeywords").get();
          let kwList = kwDoc.exists ? (kwDoc.data().keywords || []) : [];
          keywords.forEach(kw => {
            const ex = kwList.find(k => k.keyword === kw);
            if (ex) { ex.count++; ex.lastUpdated = Date.now(); }
            else { kwList.push({ keyword: kw, count: 1, lastUpdated: Date.now() }); }
          });
          kwList.sort((a, b) => b.count - a.count);
          kwList = kwList.slice(0, 20);
          await prefRef.doc("likedKeywords").set({ keywords: kwList });

          // ✅ NEW: Save liked song directly to a 'likedSongs' subcollection
          const likedSongsRef = db.collection("users").doc(userId).collection("likedSongs");
          await likedSongsRef.doc(videoId).set({
            videoId,
            title: title || "Unknown Title",
            channelTitle: channelTitle || "Unknown Artist",
            thumbnail: thumbnail || "",
            likedAt: Date.now()
          }, { merge: true });

        } catch (e) {
          console.error("❌ Firestore like persist failed:", e.message);
        }
      });
    }

    return res.json({
      ok: true,
      message: "Video liked",
      likedKeywords: session.likedKeywords,
      boostedCount,
      effect: "immediate_boost_and_future_bias",
    });
  } catch (error) {
    console.error("❌ Error in /like:", error.message);
    return res.status(500).json({ error: "Like failed" });
  }
});

// ============================================================
// ENDPOINT 8: Dislike handler (Immediate queue adaptation)
// ============================================================
// ✅ NEW: Implement dislike behavior with immediate queue rebuild
router.post("/dislike", async (req, res) => {
  try {
    const { sessionId, videoId, title, channelTitle, userId } = req.body;

    if (!sessionId || !videoId) {
      return res.status(400).json({ error: "sessionId and videoId required" });
    }

    const session = getOrCreateSession(sessionId);
    
    // ✅ NEW: Extract keywords from disliked video
    const keywords = extractKeywords(title || "", channelTitle || "");
    
    // Add to disliked keywords (avoid duplicates)
    keywords.forEach(keyword => {
      if (!session.dislikedKeywords.includes(keyword)) {
        session.dislikedKeywords.push(keyword);
      }
    });

    // Keep only top 10 disliked keywords
    session.dislikedKeywords = session.dislikedKeywords.slice(0, 10);

    console.log(`👎 DISLIKE: ${videoId} - Keywords added:`, keywords);
    console.log(`📊 Session disliked keywords:`, session.dislikedKeywords);

    // ✅ IMPORTANT: Immediately remove similar videos from queue
    console.log(`🔄 Removing similar videos from queue...`);
    const similarityThreshold = 0.5;
    session.videos = session.videos.filter(video => {
      if (video.videoId === videoId) return false; // Explicitly remove the disliked video itself
      const videoKeywords = extractKeywords(video.title || "", video.channelTitle || "");
      const commonKeywords = videoKeywords.filter(k => session.dislikedKeywords.includes(k));
      const similarity = commonKeywords.length / Math.max(videoKeywords.length, 1);
      return similarity <= similarityThreshold;
    });

    console.log(`📊 Queue after filtering: ${session.videos.length} videos`);

    // ✅ NEW: Rebuild queue using dynamic query if it becomes too small
    if (session.videos.length < QUEUE_MIN_SIZE && session.mood) {
      console.log(`⚠️ Queue too small, rebuilding with updated preferences...`);
      await refillSessionQueue(sessionId, session.mood, { allowSearch: true });
    }

    touchSession(sessionId);

    // SECTION 1A: Persist disliked video and keywords to Firestore
    if (userId) {
      runNonBlocking(async () => {
        try {
          const { getFirestore } = require("firebase-admin/firestore");
          const db = getFirestore();
          const prefRef = db.collection("users").doc(userId).collection("preferences");
          
          // Save disliked videoId
          const vidDoc = await prefRef.doc("dislikedVideos").get();
          let videos = vidDoc.exists ? (vidDoc.data().videos || []) : [];
          if (!videos.includes(videoId)) {
            videos.push(videoId);
            await prefRef.doc("dislikedVideos").set({ videos });
          }
          
          // Save disliked keywords
          const kwDoc = await prefRef.doc("dislikedKeywords").get();
          let kwList = kwDoc.exists ? (kwDoc.data().keywords || []) : [];
          keywords.forEach(kw => {
            const ex = kwList.find(k => k.keyword === kw);
            if (ex) { ex.count++; ex.lastUpdated = Date.now(); }
            else { kwList.push({ keyword: kw, count: 1, lastUpdated: Date.now() }); }
          });
          kwList.sort((a, b) => b.count - a.count);
          kwList = kwList.slice(0, 20);
          await prefRef.doc("dislikedKeywords").set({ keywords: kwList });
        } catch (e) {
          console.error("❌ Firestore dislike persist failed:", e.message);
        }
      });
    }

    return res.json({
      ok: true,
      message: "Video disliked",
      dislikedKeywords: session.dislikedKeywords,
      effect: "immediate_removal_and_rebuild",
      queueSize: session.videos.length,
    });
  } catch (error) {
    console.error("❌ Error in /dislike:", error.message);
    return res.status(500).json({ error: "Dislike failed" });
  }
});

// ============================================================
// ENDPOINT 9: Get session preferences (diagnostics)
// ============================================================
// ✅ NEW: Return current session learning state
router.get("/session-preferences", (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = getOrCreateSession(sessionId);
    touchSession(sessionId);

    return res.json({
      sessionId,
      mood: session.mood,
      likedKeywords: session.likedKeywords,
      dislikedKeywords: session.dislikedKeywords,
      queueSize: session.videos.length,
      playedCount: playedHistory.get(sessionId)?.size || 0,
    });
  } catch (error) {
    console.error("❌ Error in /session-preferences:", error.message);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// ============================================================
// ENDPOINT 10: Reset session preferences
// ============================================================
// ✅ NEW: Clear learning data for session (fresh start)
router.post("/reset-preferences", (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = getOrCreateSession(sessionId);
    session.likedKeywords = [];
    session.dislikedKeywords = [];
    
    touchSession(sessionId);

    return res.json({
      ok: true,
      message: "Preferences reset",
      likedKeywords: session.likedKeywords,
      dislikedKeywords: session.dislikedKeywords,
    });
  } catch (error) {
    console.error("❌ Error in /reset-preferences:", error.message);
    return res.status(500).json({ error: "Reset failed" });
  }
});

// ============================================================
// ENDPOINT 5: Legacy - get recent songs
// ============================================================
router.post("/recent", (req, res) => {
  const { sessionId, videoId, title, channelTitle } = req.body || {};
  if (!sessionId || !videoId) {
    return res.status(400).json({ error: "sessionId and videoId are required" });
  }

  const existing = sessionHistory.get(sessionId) || [];
  const deduped = existing.filter((song) => song.videoId !== videoId);
  const updated = [
    { videoId, title, channelTitle, playedAt: Date.now() },
    ...deduped,
  ].slice(0, MAX_PLAYED_HISTORY);

  sessionHistory.set(sessionId, updated);
  touchSession(sessionId);
  return res.json({ ok: true, recent: updated });
});

router.get("/recent", (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const recent = sessionHistory.get(sessionId) || [];
  touchSession(sessionId);
  return res.json({ recent });
});

// ============================================================
// ENDPOINT 6: Video stats (cheap API for reference)
// ============================================================
router.get("/song/:videoId/stats", async (req, res) => {
  try {
    const { videoId } = req.params;

    const response = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
      params: {
        part: "statistics,snippet",
        id: videoId,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    const video = response.data.items[0];

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const stats = {
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
    };

    res.json(stats);
  } catch (error) {
    console.error("❌ Stats fetch failed:", error.message);
    res.status(500).json({ error: "Stats fetch failed" });
  }
});

// ✅ FIXED: periodic cleanup for inactive sessions + stale cache entries
const cleanupSessions = () => {
  const now = Date.now();
  let removedSessions = 0;

  for (const [sessionId, session] of sessionQueues.entries()) {
    if (now - (session.lastAccess || 0) > SESSION_TTL) {
      sessionQueues.delete(sessionId);
      playedHistory.delete(sessionId);
      sessionHistory.delete(sessionId);
      removedSessions += 1;
    }
  }

  for (const [cacheKey, cacheValue] of searchCache.entries()) {
    if (now - cacheValue.timestamp > CACHE_TTL) {
      searchCache.delete(cacheKey);
    }
  }

  for (const [videoId, cacheValue] of scoredVideosCache.entries()) {
    if (now - cacheValue.timestamp > SCORE_CACHE_TTL) {
      scoredVideosCache.delete(videoId);
    }
  }

  // Clear stale blend cache entries
  for (const [key, val] of blendCache.entries()) {
    if (now - val.timestamp > CACHE_TTL) blendCache.delete(key);
  }

  // Cap sessionSongPool per mood
  for (const [mood, pool] of sessionSongPool.entries()) {
    if (pool.length > 200) sessionSongPool.set(mood, pool.slice(-200));
  }

  console.log("🧹 CLEANUP: removed inactive sessions:", removedSessions);
};

const cleanupInterval = setInterval(cleanupSessions, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

// ============================================================
// ENDPOINT 7: SOLO MODE - Artist specific songs (OPTIMIZED)
// ============================================================

// --- Helper Functions ---

const shuffleResults = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const fetchArtistSongs = async (artist, maxResultsPerFetch = 15) => {
  const name = artist.toLowerCase().trim();
  const now = Date.now();
  
  if (artistCache.has(name) && Date.now() - artistCache.get(name).timestamp < ARTIST_CACHE_TTL) {
    const cached = artistCache.get(name);
    if (cached.videos && cached.videos.length > 0) {
      console.log(`✅ Personalized Mode cache hit for: ${name}`);
      return shuffleResults([...cached.videos]).slice(0, maxResultsPerFetch);
    }
  }

  try {
    const responses = await Promise.all([
      fetchSearchPages(`${name} top songs official`, 1, maxResultsPerFetch),
    ]);

    const artistVideos = [];
    responses.forEach((items) => {
      items.forEach((item) => {
        artistVideos.push({
          videoId: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.medium.url,
          sourceArtist: name // Keep track for quota
        });
      });
    });
    return artistVideos;
  } catch (err) {
    console.error(`❌ Solo search failed for artist "${name}":`, err.message);
    return [];
  }
};

const filterValidVideos = async (videos) => {
  if (!isQuotaSafe(1)) {
    console.log("🔴 Quota guard: skipping filterValidVideos");
    return videos;
  }

  // FIX 1: Deduplicate first before fetching details
  const seen = new Set();
  const uniqueVideos = videos.filter(v => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });

  const validVideos = [];
  const rawIds = uniqueVideos.map(v => v.videoId);
  const poolMap = new Map();
  uniqueVideos.forEach(v => poolMap.set(v.videoId, v));

  // Batch fetch chunks of 50
  for (let i = 0; i < rawIds.length; i += 50) {
    const chunk = rawIds.slice(i, i + 50);
    try {
      const statsRes = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
         params: { part: "contentDetails,snippet", id: chunk.join(","), key: process.env.YOUTUBE_API_KEY }
      });
      
      statsRes.data.items.forEach(video => {
        const durationSeconds = parseDuration(video.contentDetails.duration);
        const titleLower = (video.snippet?.title || "").toLowerCase();
        
        // FIX 5: Reject strictly invalid formats structurally before length checks
        const isJukebox = titleLower.includes("jukebox") || titleLower.includes("audio jukebox");
        const isLive = titleLower.includes("live mix") || titleLower.includes("megamix");

        if (durationSeconds >= 120 && durationSeconds <= 480 && !isJukebox && !isLive) {
          validVideos.push(poolMap.get(video.id));
        }
      });
    } catch (e) {
      console.error("Batch content details check failed", e.message);
    }
  }
  return validVideos;
};

const distributeQuota = (validVideos, artists, targetCount = 20) => {
  const quotaPerArtist = Math.max(1, Math.floor(targetCount / artists.length));
  const finalVideos = [];
  const extraPool = [];

  artists.forEach(artist => {
    const name = artist.toLowerCase().trim();
    const artistSongs = validVideos.filter(v => v.sourceArtist === name);
    
    // FIX 2: Process exact top quota + hold leftovers
    const topResults = artistSongs.slice(0, quotaPerArtist);
    const leftovers = artistSongs.slice(quotaPerArtist);

    topResults.forEach(v => finalVideos.push(v));
    leftovers.forEach(v => extraPool.push(v));
  });

  return { finalVideos, extraPool };
};

const fillRemaining = (finalVideos, extraPool, targetCount = 20) => {
  let remainingSlots = targetCount - finalVideos.length;
  let extraIdx = 0;
  
  while (remainingSlots > 0 && extraIdx < extraPool.length) {
    finalVideos.push(extraPool[extraIdx]);
    remainingSlots--;
    extraIdx++;
  }
  
  return finalVideos;
};

// --- Main Route ---

// ============================================================
// PART A: Prewarm Artists Cache
// ============================================================
router.post("/prewarm-artists", async (req, res) => {
  try {
    if (!isQuotaSafe(200)) {
      return res.json({ ok: false, message: "Quota limit reached, skipping prewarm" });
    }

    const { artists } = req.body;
    if (!artists || !Array.isArray(artists)) {
      return res.status(400).json({ error: "Missing artists array" });
    }
    
    const limitedArtists = artists.slice(0, 10);
    const now = Date.now();
    
    const promises = limitedArtists.map(async (artist) => {
      const name = artist.toLowerCase().trim();
      if (artistCache.has(name) && now - artistCache.get(name).timestamp < ARTIST_CACHE_TTL) {
        const cacheAgeMinutes = Math.round((now - artistCache.get(name).timestamp) / 60000);
        console.log(`📦 PREWARM SKIP: ${name} already cached globally for all users, age: ${cacheAgeMinutes} mins`);
        return; // Already cached
      }
      
      try {
        const [popular, hits] = await Promise.all([
          fetchSearchPages(`${name} popular songs official`, 1, 50),
          fetchSearchPages(`${name} best hits playlist`, 1, 25)
        ]);
        
        const artistVideos = [];
        const seen = new Set();
        
        const processItem = (item) => {
          if (!seen.has(item.id.videoId)) {
            seen.add(item.id.videoId);
            artistVideos.push({
              videoId: item.id.videoId,
              title: item.snippet.title,
              channelTitle: item.snippet.channelTitle,
              thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
              sourceArtist: name
            });
          }
        };
        
        popular.forEach(processItem);
        hits.forEach(processItem);
        
        artistCache.set(name, {
          videos: artistVideos,
          timestamp: now,
          offset: Math.floor(Math.random() * Math.max(1, artistVideos.length))
        });
        console.log(`✅ Prewarmed artist: ${name} (${artistVideos.length} songs)`);
      } catch (err) {
        if (err.name === "QuotaSafeFallback") {
          console.log(`🔴 Prewarm hit quota limit for ${name}, aborting.`);
          return;
        }
        console.error(`❌ Prewarm failed for ${name}:`, err.message);
      }
    });
    
    await Promise.all(promises);
    return res.json({ ok: true, message: "Artists prewarmed successfully" });
  } catch (error) {
    console.error("❌ Error in /prewarm-artists:", error.message);
    return res.status(500).json({ error: "Prewarm failed" });
  }
});

router.post("/solo-songs", async (req, res) => {
  try {
    const { selectedArtists, userId } = req.body;
    if (!selectedArtists || !Array.isArray(selectedArtists) || selectedArtists.length === 0) {
      return res.status(400).json({ error: "Missing or invalid selectedArtists array" });
    }

    const limitedArtists = selectedArtists.slice(0, 10);
    const now = Date.now();
    
    let allFetchedVideos = [];
    
    const artistPromises = limitedArtists.map(async (artist) => {
      const name = artist.toLowerCase().trim();
      
      // Level 1: Cache Hit
      if (artistCache.has(name) && now - artistCache.get(name).timestamp < ARTIST_CACHE_TTL) {
        const cached = artistCache.get(name);
        const videos = cached.videos;
        if (videos.length > 0) {
          const offset = cached.offset || 0;
          let selected = [];
          for (let i = 0; i < 15; i++) {
            selected.push(videos[(offset + i) % videos.length]);
          }
          cached.offset = (offset + 15) % videos.length;
          console.log(`📦 SOLO CACHE HIT: ${name}, offset: ${cached.offset}`);
          return shuffleResults(selected);
        }
      }

      // Level 1.5: API Fetch (if quota safe)
      if (isQuotaSafe(100)) {
        console.log(`🔍 CACHE MISS: ${name}. Fetching from YouTube API...`);
        try {
          const [popular, hits] = await Promise.all([
            fetchSearchPages(`${name} popular songs official`, 1, 30).catch(() => []),
            fetchSearchPages(`${name} best hits playlist`, 1, 20).catch(() => [])
          ]);
          
          const artistVideos = [];
          const seen = new Set();
          
          const processItem = (item) => {
            if (!seen.has(item.id.videoId)) {
              seen.add(item.id.videoId);
              artistVideos.push({
                videoId: item.id.videoId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                sourceArtist: name
              });
            }
          };
          
          popular.forEach(processItem);
          hits.forEach(processItem);
          
          if (artistVideos.length > 0) {
            artistCache.set(name, {
              videos: artistVideos,
              timestamp: Date.now(),
              offset: Math.floor(Math.random() * Math.max(1, artistVideos.length))
            });
            console.log(`✅ Fetched and cached missing artist: ${name} (${artistVideos.length} songs)`);
            return shuffleResults(artistVideos).slice(0, 15);
          }
        } catch (err) {
          console.error(`❌ Fetch failed for ${name}:`, err.message);
        }
      }

      // Level 2: Fallback (Caches/Seeds)
      console.log(`⚠️ SOLO FALLBACK: ${name} (API fetch failed or quota exhausted)`);
      const fallback = await getFallbackSongs("personalized", name, userId);
      if (fallback && fallback.songs && fallback.songs.length > 0) {
        return fallback.songs;
      }

      return [];
    });

    const resultsArray = await Promise.all(artistPromises);
    
    resultsArray.forEach(arr => {
      allFetchedVideos = allFetchedVideos.concat(arr);
    });

    if (allFetchedVideos.length === 0) {
      return res.json({ songs: [] });
    }

    // SECTION 1A: Load preferences for Solo Mode to filter disliked videos
    const dummySession = {};
    if (userId) {
      await loadUserPreferences(userId, dummySession);
    }
    const dislikedVids = dummySession.dislikedVideos || [];

    // Filter by recent songs and disliked videos
    const recentSongs = await getRecentSongs(userId);
    const varietyFilteredVideos = applyRecentSongFilter(allFetchedVideos, recentSongs, dislikedVids);

    // Take up to 50 songs assembled from multiple artists
    let completeMix = shuffleResults(varietyFilteredVideos);
    completeMix = completeMix.slice(0, 50);

    if (completeMix.length === 0) {
      return res.json({ songs: [] });
    }
    
    // Final deduplication assertion 
    const finalMap = new Map();
    completeMix.forEach(v => {
      if (!finalMap.has(v.videoId)) {
        finalMap.set(v.videoId, v);
      }
    });
    const resultToReturn = Array.from(finalMap.values());

    if (userId) {
      runNonBlocking(() => addRecentSongs(userId, resultToReturn.map(song => ({
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail,
        playedAt: Date.now()
      }))));
    }

    return res.json({ songs: resultToReturn });
  } catch (error) {
    if (error.name === "QuotaSafeFallback") {
      return res.json({
        songs: error.fallback.songs,
        meta: {
          source: error.fallback.source,
          quotaSafeMode: true,
          quotaSafe: true
        }
      });
    }
    console.error("❌ /solo-songs failed:", error);
    res.status(500).json({ error: "Failed to generate solo mix logic execution" });
  }
});

module.exports = router;
