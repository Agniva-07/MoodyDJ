import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import axios from "axios";
import { updateCachedPool } from "./services/cacheService";
import { getSongsByMood, getAllSongs, getSongsCount, ensureSeedSongsLoaded, saveSongsToPool } from "./services/dbService";
import { generateLocalQueue } from "./services/localEngine";
import LandingPage from "./pages/LandingPage";
import PlayerPage from "./pages/PlayerPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProfilePage from "./pages/ProfilePage";
import ProtectedRoute from "./components/ProtectedRoute";
import ArtistSelection from "./components/ArtistSelection";
import DailyArtistPrompt from "./components/DailyArtistPrompt";
import ModeSelection from "./pages/ModeSelection";
import SoloPage from "./pages/SoloPage";
import PlaylistPage from "./pages/PlaylistPage";
import { ARTISTS_DATA } from "./data/artists";
import { useArtists } from "./context/ArtistContext";
import { saveHistory, getUserData } from "./services/userService";
import { useToast } from "./context/ToastContext";
import DebugPanel from "./components/DebugPanel";
import "./App.css";

const moods = [
  { id: "chill", icon: "🌿", title: "Chill", subtitle: "Relax & unwind" },
  { id: "sad", icon: "😢", title: "Sad", subtitle: "Deep and emotional" },
  { id: "focus", icon: "📚", title: "Focus", subtitle: "Zone in and create" },
  { id: "hype", icon: "🔥", title: "Hype", subtitle: "Turn energy all the way up" },
];

const MOOD_KEYWORD_MAP = {
  chill: ["lofi", "chill", "hindi"],
  sad: ["sad", "emotional", "hindi"],
  focus: ["instrumental", "study"],
  hype: ["hype", "workout", "hindi"],
};

const getOrCreateSessionId = () => {
  const existing = localStorage.getItem("sessionId");
  if (existing) return existing;
  const generated = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("sessionId", generated);
  return generated;
};

const getCurrentUserId = () => {
  try {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser)?.uid || "" : "";
  } catch {
    return "";
  }
};

const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

function App() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const saveHistoryTimeoutRef = useRef(null);
  const hasShownQuotaWarningRef = useRef(false);

  // 1. Restore queue synchronously on startup from localStorage (Requirement 2)
  const [songs, setSongs] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.songs && parsed.songs.length > 0) return parsed.songs;
      }
    } catch (e) {}
    return [];
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentIndex !== undefined) return parsed.currentIndex;
      }
    } catch (e) {}
    return 0;
  });

  const [selectedMood, setSelectedMood] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedMood) return parsed.selectedMood;
      }
    } catch (e) {}
    return null;
  });

  const [blendConfig, setBlendConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.blendConfig) return parsed.blendConfig;
      }
    } catch (e) {}
    return {
      mood1: "chill",
      mood2: "focus",
      weight1: 60,
      weight2: 40,
    };
  });

  const [sessionId, setSessionId] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sessionId) return parsed.sessionId;
      }
    } catch (e) {}
    return getOrCreateSessionId();
  });

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [playedIds, setPlayedIds] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [likedKeywords, setLikedKeywords] = useState([]);
  const [dislikedVideoIds, setDislikedVideoIds] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_disliked_video_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [dislikedArtistNames, setDislikedArtistNames] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_disliked_artists");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [recentSongs, setRecentSongs] = useState([]);
  const [autoPlay] = useState(true);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [quotaSafe, setQuotaSafe] = useState(true);
  const [quotaUnits, setQuotaUnits] = useState(0);
  const playerRef = useRef(null);
  const lastSavedVideoRef = useRef(null);

  // Personalized Mode State — use global context
  const { selectedArtists, setSelectedArtists, artistsLoaded } = useArtists();
  const [showArtistSelection, setShowArtistSelection] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(false);

  useEffect(() => {
    const savedLiked = localStorage.getItem("likedSongs");
    if (savedLiked) setLikedSongs(JSON.parse(savedLiked));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("moodydj_app_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.songs && parsed.songs.length > 0) {
          console.log(`🔌 [QUEUE RESTORATION] Restored queue from localStorage: ${parsed.songs.length} songs, currentIndex: ${parsed.currentIndex ?? 0}`);
        }
      }
    } catch (e) {}
  }, []);

  // 2. Persist queue whenever it changes (Throttled/Debounced - Requirement 5)
  const saveQueueDebounced = useRef(
    debounce((queueData) => {
      try {
        localStorage.setItem("moodydj_app_queue", JSON.stringify(queueData));
      } catch (e) {
        console.error("Failed to persist app queue:", e);
      }
    }, 1000)
  ).current;

  useEffect(() => {
    if (songs.length > 0) {
      saveQueueDebounced({
        songs,
        currentIndex,
        sessionId,
        selectedMood,
        blendConfig
      });
    }
  }, [songs, currentIndex, sessionId, selectedMood, blendConfig]);

  // Determine if artist selection should show based on context load
  useEffect(() => {
    if (!artistsLoaded) return;
    if (selectedArtists.length < 3) {
      setShowArtistSelection(true);
    } else {
      setShowArtistSelection(false);
      const savedPersonalized = localStorage.getItem("isPersonalized");
      setIsPersonalized(savedPersonalized === "true");
    }
  }, [artistsLoaded, selectedArtists]);

  // Repair empty DB for existing users
  useEffect(() => {
    if (!artistsLoaded || selectedArtists.length < 3) return;
    const checkAndRepair = async () => {
      try {
        const count = await getSongsCount();
        if (count < 100) {
          console.log("🔧 [DB REPAIR] DB has < 100 songs, triggering prewarm repair...");
          const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/prewarm-artists`, {
            artists: selectedArtists
          });
          if (res.data && res.data.songs) {
            await saveSongsToPool(res.data.songs);
            updateCachedPool(res.data.songs);
            console.log("🔧 [DB REPAIR] Repaired local DB with prewarmed songs.");
          }
        }
      } catch (e) {
        console.warn("🔧 [DB REPAIR] Failed to repair DB:", e.message);
      }
    };
    checkAndRepair();
  }, [artistsLoaded, selectedArtists]);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      getUserData(user.uid).then(data => {
        if (data && data.history) setRecentSongs(data.history);
      });
    } else if (sessionId) {
      const loadRecent = async () => {
        try {
          const res = await axios.get(`http://localhost:5000/api/recent?sessionId=${sessionId}`);
          setRecentSongs(res.data.recent || []);
        } catch (err) {
          console.log(err);
        }
      };
      loadRecent();
    }
  }, [sessionId]);

  useEffect(() => {
    const API_URL = "http://localhost:5000";
    const checkQuota = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/quota-status`);
        setQuotaSafe(res.data.isQuotaSafe);
        setQuotaUnits(res.data.unitsUsed);
      } catch (e) {}
    };
    checkQuota();
    const interval = setInterval(checkQuota, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNextSong = () => {
    if (songs.length === 0) return;
    let nextIndex;
    if (shuffle) {
      let tries = 0;
      do {
        nextIndex = Math.floor(Math.random() * songs.length);
        tries += 1;
      } while (playedIds.has(songs[nextIndex].videoId) && tries < songs.length);
    } else {
      nextIndex = (currentIndex + 1) % songs.length;
    }
    setPlayedIds((prev) => new Set(prev).add(songs[currentIndex].videoId));
    if (playedIds.size === songs.length - 1) setPlayedIds(new Set());
    setCurrentIndex(nextIndex);
  };

  const handleAddToQueue = (song) => {
    setSongs(prev => {
      // Prevent consecutive duplicates
      if (prev.length > 0 && prev[prev.length - 1].videoId === song.videoId) {
        return prev; 
      }
      return [...prev, song];
    });
  };

  const handleRefreshList = async () => {
    console.log("🔄 [REFRESH LIST] Refresh triggered. Source: IndexedDB. No API calls.");
    
    try {
      setLoading(true);
      
      // Ensure seed songs are loaded if DB is completely empty (ultimate safety)
      await ensureSeedSongsLoaded("RefreshList fallback", { caller: "handleRefreshList" });

      const mood1 = blendConfig.mood1;
      const mood2 = blendConfig.mood2;
      const weight1 = blendConfig.weight1;
      const weight2 = blendConfig.weight2;

      let songsFromDb = [];

      if (mood2 && weight2 > 0) {
        const [pool1, pool2] = await Promise.all([
          getSongsByMood(mood1),
          getSongsByMood(mood2)
        ]);
        
        const targetSize = 100;
        const count1 = Math.round((weight1 / 100) * targetSize);
        const count2 = targetSize - count1;
        
        const shuffleSlice = (arr, size) => {
          const shuffled = [...arr].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, size);
        };
        
        songsFromDb = [...shuffleSlice(pool1, count1), ...shuffleSlice(pool2, count2)];
      } else if (mood1) {
        songsFromDb = await getSongsByMood(mood1);
      } else {
        songsFromDb = await getAllSongs();
      }

      if (songsFromDb.length === 0) {
        songsFromDb = await getAllSongs();
      }

      // Generate a fresh local queue, avoiding the current queue songs and recent songs
      const localQueue = generateLocalQueue(songsFromDb, {
        recentSongs,
        currentQueue: songs, // avoid current queue songs
        targetSize: 50,
        avoidPlayedIds: new Set(),
        dislikedVideoIds,
        dislikedArtistNames
      });

      console.log(`🔄 [LOCAL REFRESH] Regenerated queue locally from IndexedDB. Count: ${localQueue.length}. Zero API calls.`);

      if (localQueue.length > 0) {
        setSongs(localQueue);
        setCurrentIndex(0);
        setPlayedIds(new Set());
      } else {
        showToast("No new songs found in local cache.", "info");
      }
    } catch (err) {
      console.error("Local refresh failed:", err);
      showToast("Failed to refresh list locally.", "error");
    } finally {
      setLoading(false);
    }
  };

  const buildMoodRequestParams = (selection, keywordState = {}) => {
    const payload = typeof selection === "string" ? { mood1: selection } : selection;
    const safeWeight1 = Number(payload.weight1 ?? 100);
    const normalizedWeight1 = Math.max(0, Math.min(100, safeWeight1));
    const normalizedWeight2 = payload.mood2 ? 100 - normalizedWeight1 : 0;
    const liked = keywordState.likedKeywords ?? likedKeywords;

    return {
      mood1: payload.mood1,
      mood2: payload.mood2 || "",
      weight1: normalizedWeight1,
      weight2: normalizedWeight2,
      userId: getCurrentUserId(),
      likedKeywords: liked.join(","),
      dislikedVideoIds: dislikedVideoIds.join(","),
      sessionId,
      isPersonalized: isPersonalized,
      selectedArtists: isPersonalized 
          ? ARTISTS_DATA.filter(a => selectedArtists.includes(a.id)).map(a => a.name).join(",") 
          : "",
    };
  };

  const handleMood = async (selection, keywordState) => {
    try {
      setLoading(true);
      const payload = typeof selection === "string" ? { mood1: selection } : selection;
      const mood1 = payload.mood1;
      const mood2 = payload.mood2 || "";
      const weight1 = Number(payload.weight1 ?? 100);
      const weight2 = mood2 ? 100 - weight1 : 0;

      setSelectedMood(mood1);
      setBlendConfig({
        mood1,
        mood2,
        weight1,
        weight2,
      });

      console.log(`🧠 [LOCAL PLAYBACK] Generating queue for Mood: ${mood1} ${mood2 ? `+ ${mood2} (${weight1}/${weight2})` : ""}`);

      // Ensure seed songs are loaded if DB is completely empty (ultimate safety)
      await ensureSeedSongsLoaded("Mood generation fallback", { caller: "handleMood", mood1, mood2 });

      // Fetch matching songs from IndexedDB
      let songsFromDb = [];

      if (mood2 && weight2 > 0) {
        const [pool1, pool2] = await Promise.all([
          getSongsByMood(mood1),
          getSongsByMood(mood2)
        ]);
        
        // Combine them in proportion to weights
        const targetSize = 100;
        const count1 = Math.round((weight1 / 100) * targetSize);
        const count2 = targetSize - count1;
        
        const shuffleSlice = (arr, size) => {
          const shuffled = [...arr].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, size);
        };
        
        songsFromDb = [...shuffleSlice(pool1, count1), ...shuffleSlice(pool2, count2)];
      } else {
        songsFromDb = await getSongsByMood(mood1);
      }

      // If no songs match this mood in IndexedDB, fall back to getting all songs
      if (songsFromDb.length === 0) {
        console.warn(`⚠️ No local songs found for mood(s). Falling back to all stored songs.`);
        songsFromDb = await getAllSongs();
      }

      // Generate the local queue
      const localQueue = generateLocalQueue(songsFromDb, {
        recentSongs,
        currentQueue: [], // fresh queue
        targetSize: 50,
        avoidPlayedIds: new Set(),
        dislikedVideoIds,
        dislikedArtistNames
      });

      console.log(`✅ [LOCAL QUEUE ENGINE] Generated Mood queue: ${localQueue.length} songs. Source: IndexedDB. Excluded: ${recentSongs.length} played. Zero API calls.`);

      setSongs(localQueue);
      setCurrentIndex(0);
      setPlayedIds(new Set());
      navigate("/player");
    } catch (err) {
      console.error("Local mood selection failed:", err);
      showToast("Failed to generate queue locally.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (songs.length === 0) return;
    // YouTube embed iframe loads automatically when videoId changes
    // No need to load YouTube IFrame API
  }, [songs, autoPlay]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.code === "ArrowRight") handleNextSong();
      if (e.code === "ArrowLeft") handlePrevSong();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [songs, currentIndex, shuffle, playedIds]);

  useEffect(() => {
    if (songs.length === 0) return;
    
    const nowPlaying = songs[currentIndex];
    
    // Reset states when song changes
    setLiked(false);
    setDisliked(false);
    
    fetchStats(nowPlaying.videoId);
    
    // Clear any pending history write timeout
    if (saveHistoryTimeoutRef.current) {
      clearTimeout(saveHistoryTimeoutRef.current);
    }

    // Schedule history write after 20 seconds of continuous playback
    saveHistoryTimeoutRef.current = setTimeout(() => {
      if (lastSavedVideoRef.current !== nowPlaying.videoId) {
        lastSavedVideoRef.current = nowPlaying.videoId;
        
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          saveHistory(user.uid, nowPlaying).then(history => {
            if (history) setRecentSongs(history);
          }).catch(err => console.log("Failed to save history", err));
        } else if (sessionId) {
          axios
            .post("http://localhost:5000/api/recent", {
              sessionId,
              videoId: nowPlaying.videoId,
              title: nowPlaying.title,
              channelTitle: nowPlaying.channelTitle,
            })
            .then((res) => {
              setRecentSongs(res.data.recent || []);
            })
            .catch((err) => {
              console.log("Local recent fetch fail:", err);
            });
        }
      }
    }, 20000); // 20 seconds debounce

    return () => {
      if (saveHistoryTimeoutRef.current) {
        clearTimeout(saveHistoryTimeoutRef.current);
      }
    };
  }, [currentIndex, songs, sessionId]);

  // Prefetching and automatic queue refills are handled locally now.

  // Monitor playback for Auto-DJ prefetch (simplified for embed iframe)
  // Disabled automatic prefetch as per new requirement: "Automatic refreshes should NOT happen anymore"
  // User wants explicit refresh list button instead.
  // useEffect(() => { ... prefetch logic ... }, [...])

  const handlePlayPause = () => {
    setIsPlaying(prev => !prev);
  };

  const handlePrevSong = () => {
    if (songs.length === 0) return;
    setCurrentIndex((currentIndex - 1 + songs.length) % songs.length);
  };

  const getBlendKeywords = () => {
    const tokens1 = MOOD_KEYWORD_MAP[blendConfig.mood1] || [];
    const tokens2 = blendConfig.mood2 ? MOOD_KEYWORD_MAP[blendConfig.mood2] || [] : [];
    return [...tokens1, ...tokens2];
  };

  const handleLike = async () => {
    const song = songs[currentIndex];
    if (!song) return;

    // ✅ FIXED: Toggle like state for UI feedback
    setLiked(prev => !prev);

    // ✅ NEW: Call backend /like endpoint
    try {
      await axios.post("http://localhost:5000/api/like", {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail,
        userId: getCurrentUserId()
      });
      console.log("❤️ Like registered:", song.videoId);
    } catch (err) {
      console.error("Like failed:", err);
    }

    // Also update local state
    if (!likedSongs.some((s) => s.videoId === song.videoId)) {
      const updated = [...likedSongs, song];
      setLikedSongs(updated);
      localStorage.setItem("likedSongs", JSON.stringify(updated));
    }
  };

  const handleDislike = async () => {
    const song = songs[currentIndex];
    if (!song) return;
    const API_URL = "http://localhost:5000";
    
    setDisliked(true);
    try {
      // 1. Update local disliked collections
      const songArtist = (song.artistNormalized || song.artist || "").toLowerCase().trim();
      
      setDislikedVideoIds(prev => {
        const updated = Array.from(new Set([...prev, song.videoId]));
        localStorage.setItem("moodydj_disliked_video_ids", JSON.stringify(updated));
        return updated;
      });

      if (songArtist) {
        setDislikedArtistNames(prev => {
          const updated = Array.from(new Set([...prev, songArtist]));
          localStorage.setItem("moodydj_disliked_artists", JSON.stringify(updated));
          return updated;
        });
      }

      // 2. Remove from queue immediately
      setSongs(prev => {
        const nextSongs = prev.filter(s => s.videoId !== song.videoId);
        if (nextSongs.length === 0) {
          setCurrentIndex(0);
          return [];
        }
        if (currentIndex >= nextSongs.length) {
          setCurrentIndex(0);
        }
        return nextSongs;
      });

      // 3. Sync dislike to server/Firestore in background
      await axios.post(`${API_URL}/api/dislike`, {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        userId: getCurrentUserId()
      });
    } catch (err) {
      console.error("Dislike failed:", err.message);
    }
  };

  const fetchStats = async (videoId) => {
    const song = songs.find(s => s.videoId === videoId);
    if (song?.validated === true) {
      setStats({
        viewCount: song.viewCount || 0,
        likeCount: song.likeCount || 0
      });
      return;
    }
    try {
      setStats(null);
      const res = await axios.get(`http://localhost:5000/api/song/${videoId}/stats`);
      setStats(res.data);
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.log("Stats fetch failed:", err.message);
      }
    }
  };

  const currentSong = songs[currentIndex];

  const getPrewarmedArtistIds = () => {
    const prewarmedArtists = localStorage.getItem('prewarmedArtists');
    if (!prewarmedArtists) return [];
    try {
      const names = JSON.parse(prewarmedArtists);
      return names
        .map(name => ARTISTS_DATA.find(a => a.name === name)?.id)
        .filter(id => id !== undefined);
    } catch {
      return [];
    }
  };

  const handleArtistSelectionComplete = (artists) => {
    setSelectedArtists(artists); // Goes through ArtistContext → Firestore + localStorage
    setShowArtistSelection(false);
    navigate("/mode-select");
  };

  const handleTogglePersonalized = (checked) => {
    setIsPersonalized(checked);
    localStorage.setItem("isPersonalized", checked);
  };

  return (
    <>
      <DailyArtistPrompt />
      <Routes>
        <Route path="/" element={<Navigate to="/mode-select" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              {showArtistSelection && (
                <ArtistSelection 
                  initialSelected={selectedArtists}
                  prewarmedIds={getPrewarmedArtistIds()}
                  onComplete={handleArtistSelectionComplete} 
                />
              )}
              <LandingPage
                moods={moods}
                selectedMood={selectedMood}
                loading={loading}
                blendConfig={blendConfig}
                onMoodSelect={handleMood}
                isPersonalized={isPersonalized}
                onTogglePersonalized={handleTogglePersonalized}
                onEditArtists={() => navigate("/artists")}
                canPersonalize={selectedArtists.length >= 3}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mode-select"
          element={
            <ProtectedRoute>
              {showArtistSelection && (
                <ArtistSelection 
                  initialSelected={selectedArtists}
                  prewarmedIds={getPrewarmedArtistIds()}
                  onComplete={handleArtistSelectionComplete} 
                />
              )}
              {!showArtistSelection && <ModeSelection artists={selectedArtists} />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/solo"
          element={
            <ProtectedRoute>
              <SoloPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/player"
          element={
            <ProtectedRoute>
              <PlayerPage
                moods={moods}
                selectedMood={selectedMood}
                songs={songs}
                currentIndex={currentIndex}
                currentSong={currentSong}
                isPlaying={isPlaying}
                shuffle={shuffle}
                stats={stats}
                recentSongs={recentSongs}
                onMoodSelect={handleMood}
                onPlayPause={handlePlayPause}
                onNext={handleNextSong}
                onPrev={handlePrevSong}
                onShuffle={() => setShuffle(!shuffle)}
                onLike={handleLike}
                onDislike={handleDislike}
                onSelectSong={setCurrentIndex}
                blendConfig={blendConfig}
                onBlendChange={setBlendConfig}
                likedKeywords={likedKeywords}
                dislikedArtists={dislikedArtistNames}
                liked={liked}
                disliked={disliked}
                playerRef={playerRef}
                onAddToQueue={handleAddToQueue}
                onRefreshList={handleRefreshList}
              />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/artists" 
          element={
            <ProtectedRoute>
              <ArtistSelection 
                initialSelected={selectedArtists}
                prewarmedIds={getPrewarmedArtistIds()}
                onComplete={(artists) => {
                  handleArtistSelectionComplete(artists);
                }} 
              />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/playlist/:id"
          element={
            <ProtectedRoute>
              <PlaylistPage
                onPlaySongs={(songsList, startIndex) => {
                  setSongs(songsList);
                  setCurrentIndex(startIndex || 0);
                  setPlayedIds(new Set());
                  navigate("/player");
                }}
                onAddToQueue={handleAddToQueue}
              />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <DebugPanel />
      <div style={{
        position:'fixed', bottom:'16px', right:'16px',
        width:'10px', height:'10px', borderRadius:'50%',
        background: quotaSafe ? '#1db954' : '#ff4444',
        zIndex: 9999,
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        cursor: 'help'
      }} title={`Quota: ${quotaUnits}/10000`} />
    </>
  );
}

export default App;
