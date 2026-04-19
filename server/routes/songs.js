const express = require("express");
const axios = require("axios");

const router = express.Router();

// ============================================================
// QUOTA OPTIMIZATION: Cache & Session Management
// ============================================================

// Search result cache (key = moodKeyword)
const searchCache = new Map();

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

const CACHE_TTL = 12 * 60 * 1000; // 12 minutes
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

const MOOD_KEYWORDS = {
  chill: "lofi chill hindi",
  sad: "sad emotional hindi",
  focus: "instrumental study",
  hype: "hindi workout hype"
};

// Quality boost patterns for high-quality sources
const QUALITY_BOOST_PATTERNS = {
  isMix: /mix|compilation|playlist|jukebox|lofi mix|chill mix|sad mix|focus mix|workout mix/i,
  isPlaylist: /playlist|album|collection/i,
  lowQualityKeywords: /remix|cover|nightcore|phonk remix|ultra remix|trap remix|hardstyle/i,
};

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

  try {
    // ✅ FIXED: Reuse per-video scoring cache to avoid recomputation
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

        // Parse ISO 8601 duration (PT3M45S)
        const durationSeconds = parseDuration(duration);

        // FIX 2: Include Both Playlists + Single Songs
        const isSingle = durationSeconds >= SINGLE_MIN && durationSeconds <= SINGLE_MAX;
        const isPlaylistVid = durationSeconds >= PLAYLIST_MIN && durationSeconds <= PLAYLIST_MAX;

        if (!isSingle && !isPlaylistVid) {
          return acc;
        }

        const viewCount = BigInt(stats.viewCount || 0);
        const likeCount = BigInt(stats.likeCount || 0);

        // ✅ IMPROVED: Enhanced scoring with quality boosts
        const logViews = viewCount > 0 ? Math.log10(Number(viewCount)) : 0;
        const likeRatio = viewCount > 0 ? Number(likeCount) / Number(viewCount) : 0;
        
        // Base score formula
        let score = logViews * 0.5 + likeRatio * 1000 * 0.3;

        // ✅ IMPROVED: Quality boost for high-quality sources
        const viewBoost = viewCount > BigInt(VIEW_COUNT_BOOST_THRESHOLD) ? 0.3 : 0;
        
        // ✅ NEW: Mix detection and boosting
        const isMix = QUALITY_BOOST_PATTERNS.isMix.test(title);
        const mixBoost = isMix ? 0.4 : 0;
        
        // ✅ NEW: Low-quality penalty
        const isLowQuality = QUALITY_BOOST_PATTERNS.lowQualityKeywords.test(title);
        const qualityPenalty = isLowQuality ? 0.3 : 0;

        // Final score with boosts and penalties
        score = score + viewBoost + mixBoost - qualityPenalty;
        score = Math.max(score, 0.1); // Minimum score to avoid division by zero

        const scoreData = {
          videoId: video.id,
          score,
          viewCount: Number(viewCount),
          likeCount: Number(likeCount),
          duration: durationSeconds,
          isMix,
          title,
          channelTitle,
        };

        scoredVideosCache.set(video.id, {
          data: scoreData,
          timestamp: now,
        });
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
  const maxResultsPerFetch = 15;

  if (isPersonalized && artists.length > 0) {
    console.log("Artists:", artists);
    // FIX 3: Fair distribution across selected artists
    // FIX 4: Parallel fetch (Promise.all over artists)
    // FIX 1: Remove mood keywords, just use `${artist} songs` and `${artist} playlist`
    const quotaPerArtist = Math.max(1, Math.floor(20 / artists.length));

    const artistPromises = artists.map(async (artist) => {
      try {
        const responses = await Promise.all([
          axios.get("https://www.googleapis.com/youtube/v3/search", {
            params: {
              part: "snippet",
              q: `${artist} songs`, // Strictly ONLY artist name
              type: "video",
              maxResults: maxResultsPerFetch,
              videoCategoryId: "10",
              key: process.env.YOUTUBE_API_KEY,
              relevanceLanguage: "hi",
              regionCode: "IN",
            },
          }),
          axios.get("https://www.googleapis.com/youtube/v3/search", {
            params: {
              part: "snippet",
              q: `${artist} playlist`, // To help get playlists
              type: "video",
              maxResults: maxResultsPerFetch,
              videoCategoryId: "10",
              key: process.env.YOUTUBE_API_KEY,
              relevanceLanguage: "hi",
              regionCode: "IN",
            },
          })
        ]);

        const artistVideos = [];
        responses.forEach(response => {
          response.data.items.forEach(item => {
            if (!videoIdSet.has(item.id.videoId)) {
              videoIdSet.add(item.id.videoId);
              artistVideos.push({
                videoId: item.id.videoId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails.medium.url,
              });
            }
          });
        });

        // Return all found videos for this artist to be merged using the smart quota later
        return artistVideos;
      } catch (err) {
        console.error(`❌ Search failed for artist "${artist}":`, err.message);
        return [];
      }
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
      `${query} playlist`,
      `${query} mix`,
      `${query} jukebox`,
    ];

    const searchPromises = searchQueries.map(q =>
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "snippet",
          q,
          type: "video",
          maxResults: maxResultsPerFetch,
          videoCategoryId: "10",
          key: process.env.YOUTUBE_API_KEY,
          relevanceLanguage: "hi",
          regionCode: "IN",
        },
      }).catch(err => {
        console.error(`❌ Multi-query search failed for "${q}":`, err.message);
        return { data: { items: [] } };
      })
    );

    const responses = await Promise.all(searchPromises);
    responses.forEach(response => {
      response.data.items.forEach((item) => {
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
  return videos
    .map((video) => {
      const scoreData = scoreMap.get(video.videoId);
      if (!scoreData) {
        // ✅ NEW: Fallback score instead of dropping
        return {
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          thumbnail: video.thumbnail,
          score: DEFAULT_FALLBACK_SCORE,
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
        score: scoreData.score,
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

  // Weighted random selection (no sorting)
  const selected = weightedRandomSelect(session.videos, 1)[0];

  // Remove from available
  session.videos = session.videos.filter((v) => v.videoId !== selected.videoId);

  // Track as played
  played.add(selected.videoId);
  if (played.size > MAX_PLAYED_HISTORY) {
    const first = Array.from(played)[0];
    played.delete(first);
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
      touchSession(sessionId);
      console.log("🧠 SESSION:", sessionId);
    }

    const searchOpts = { allowSearch: true, isPersonalized: isPers, artists: artists };

    if (!secondaryMood) {
      const result = await searchMoodVideos(primaryMood, query1, searchOpts);
      const videos = result.videos;
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

      return res.json({
        songs: Array.from(songsDedupMap.values()),
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
    // ✅ FIXED: /songs blend mode also scored before queue storage
    const scoredBlended = await toScoredQueue(blended);

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

    return res.json({
      songs: Array.from(blendDedupMap.values()),
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
    const { sessionId } = req.query;

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

    return res.json({
      song: {
        videoId: nextSong.videoId,
        title: "Loading...", // Fetch full title on demand if needed
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
    const { sessionId, videoId, title, channelTitle } = req.body;

    if (!sessionId || !videoId) {
      return res.status(400).json({ error: "sessionId and videoId required" });
    }

    const session = getOrCreateSession(sessionId);
    
    // ✅ NEW: Extract keywords from liked video
    const keywords = extractKeywords(title || "", channelTitle || "");
    
    // Add to liked keywords (avoid duplicates)
    keywords.forEach(keyword => {
      if (!session.likedKeywords.includes(keyword)) {
        session.likedKeywords.push(keyword);
      }
    });

    // Keep only top 10 liked keywords
    session.likedKeywords = session.likedKeywords.slice(0, 10);
    
    touchSession(sessionId);

    console.log(`❤️ LIKE: ${videoId} - Keywords added:`, keywords);
    console.log(`📊 Session liked keywords:`, session.likedKeywords);

    return res.json({
      ok: true,
      message: "Video liked",
      likedKeywords: session.likedKeywords,
      effect: "future_bias",
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
    const { sessionId, videoId, title, channelTitle } = req.body;

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
      const videoKeywords = extractKeywords(video.title || "", video.channelTitle || "");
      const commonKeywords = videoKeywords.filter(k => session.dislikedKeywords.includes(k));
      const similarity = commonKeywords.length / Math.max(videoKeywords.length, 1);
      return similarity < similarityThreshold;
    });

    console.log(`📊 Queue after filtering: ${session.videos.length} videos`);

    // ✅ NEW: Rebuild queue using dynamic query if it becomes too small
    if (session.videos.length < QUEUE_MIN_SIZE && session.mood) {
      console.log(`⚠️ Queue too small, rebuilding with updated preferences...`);
      await refillSessionQueue(sessionId, session.mood, { allowSearch: true });
    }

    touchSession(sessionId);

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
  const name = artist.toLowerCase().trim(); // FIX 8: Normalization
  try {
    const responses = await Promise.all([
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: { part: "snippet", q: `${name} songs`, type: "video", maxResults: maxResultsPerFetch, videoCategoryId: "10", key: process.env.YOUTUBE_API_KEY, relevanceLanguage: "hi", regionCode: "IN" },
      }),
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: { part: "snippet", q: `${name} official songs`, type: "video", maxResults: maxResultsPerFetch, videoCategoryId: "10", key: process.env.YOUTUBE_API_KEY, relevanceLanguage: "hi", regionCode: "IN" },
      }),
    ]);

    const artistVideos = [];
    responses.forEach((response) => {
      response.data.items.forEach((item) => {
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

router.post("/solo-songs", async (req, res) => {
  try {
    const { selectedArtists } = req.body;
    if (!selectedArtists || !Array.isArray(selectedArtists) || selectedArtists.length === 0) {
      return res.status(400).json({ error: "Missing or invalid selectedArtists array" });
    }

    // FIX 4: Limit max artists per request (e.g. 6-8)
    const limitedArtists = selectedArtists.slice(0, 8);
    
    // Fetch videos in parallel
    const artistPromises = limitedArtists.map(artist => fetchArtistSongs(artist));
    const resultsArray = await Promise.all(artistPromises);
    
    // Flatten array
    let allFetchedVideos = [];
    resultsArray.forEach(arr => {
      allFetchedVideos = allFetchedVideos.concat(arr);
    });

    if (allFetchedVideos.length === 0) {
      return res.status(404).json({ error: "No results fetched from source." });
    }

    // Filter by duration & deduplicate
    const validVideos = await filterValidVideos(allFetchedVideos);

    if (validVideos.length === 0) {
      return res.status(404).json({ error: "No valid videos passed duration logic constraint." });
    }

    // Distribute quota fairly
    const { finalVideos, extraPool } = distributeQuota(validVideos, limitedArtists, 20);

    // Fill remaining slots bridging missing gaps organically 
    let completeMix = fillRemaining(finalVideos, extraPool, 20);

    // FIX 6: Fisher-Yates Safe Shuffle
    completeMix = shuffleResults(completeMix);

    // FIX 9: Final Safety Execution
    if (completeMix.length === 0) {
      return res.status(404).json({ error: "Internal fallback failed to sequence final output." });
    }
    
    // Final deduplication assertion 
    const finalMap = new Map();
    completeMix.forEach(v => {
      if (!finalMap.has(v.videoId)) {
        finalMap.set(v.videoId, v);
      }
    });
    const resultToReturn = Array.from(finalMap.values());

    return res.json({ songs: resultToReturn });
  } catch (error) {
    console.error("❌ /solo-songs failed:", error);
    res.status(500).json({ error: "Failed to generate solo mix logic execution" });
  }
});

module.exports = router;