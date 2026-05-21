import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import axios from "axios";
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
  const [likedSongs, setLikedSongs] = useState([]);
  const [likedKeywords, setLikedKeywords] = useState([]);
  const [dislikedKeywords, setDislikedKeywords] = useState([]);
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
    console.log("🔄 [REFRESH LIST] Refresh triggered. Source: cachedSongsPool (localStorage/session cache). No API calls.");
    if (!selectedMood) return;

    // 1. Reshuffle/reuse locally cached songs whenever possible (Requirement 1)
    if (songs && songs.length > 1) {
      const currentSong = songs[currentIndex];
      const remainingSongs = songs.filter((_, idx) => idx !== currentIndex);
      
      // Fisher-Yates shuffle algorithm
      const shuffledRemaining = [...remainingSongs];
      for (let i = shuffledRemaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRemaining[i], shuffledRemaining[j]] = [shuffledRemaining[j], shuffledRemaining[i]];
      }
      
      const newSongs = [currentSong, ...shuffledRemaining];
      setSongs(newSongs);
      setCurrentIndex(0);
      setPlayedIds(new Set([currentSong.videoId]));
      return;
    }

    // Fallback: If queue is somehow empty, fetch from API
    try {
      setLoading(true);
      const requestParams = buildMoodRequestParams(blendConfig, { likedKeywords, dislikedKeywords });
      const res = await axios.get("http://localhost:5000/api/songs", {
        params: requestParams,
      });
      if (res.data.songs && res.data.songs.length > 0) {
        setSongs(res.data.songs);
        setCurrentIndex(0);
        setPlayedIds(new Set());
      }
    } catch (err) {
      console.error("Refresh list failed:", err);
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
    const disliked = keywordState.dislikedKeywords ?? dislikedKeywords;

    return {
      mood1: payload.mood1,
      mood2: payload.mood2 || "",
      weight1: normalizedWeight1,
      weight2: normalizedWeight2,
      userId: getCurrentUserId(),
      likedKeywords: liked.join(","),
      dislikedKeywords: disliked.join(","),
      sessionId, // ✅ Include sessionId for Auto-DJ queue management
      isPersonalized,
      selectedArtists: isPersonalized 
          ? ARTISTS_DATA.filter(a => selectedArtists.includes(a.id)).map(a => a.name).join(",") 
          : "",
    };
  };

  const handleMood = async (selection, keywordState) => {
    try {
      setLoading(true);
      const requestParams = buildMoodRequestParams(selection, keywordState);
      setSelectedMood(requestParams.mood1);
      setBlendConfig({
        mood1: requestParams.mood1,
        mood2: requestParams.mood2 || "",
        weight1: requestParams.weight1,
        weight2: requestParams.weight2,
      });

      const res = await axios.get("http://localhost:5000/api/songs", {
        params: requestParams,
      });
      const isQuotaSafeMode = res.data.meta?.quotaSafeMode || res.data.quotaSafeMode;
      if (isQuotaSafeMode && !hasShownQuotaWarningRef.current) {
        showToast("Using cached music library to preserve API quota.", "info");
        hasShownQuotaWarningRef.current = true;
      }
      setSongs(res.data.songs || []);
      setCurrentIndex(0);
      setPlayedIds(new Set());
      navigate("/player");
    } catch (err) {
      console.log(err);
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

  // ✅ PREFETCH: Trigger at ~75% playback (Auto-DJ queue management)
  const prefetchNextSongs = async () => {
    if (!sessionId || !selectedMood) return;

    try {
      const response = await axios.post("http://localhost:5000/api/prefetch-next", {
        sessionId,
        mood: selectedMood,
      });

      console.log("📡 Prefetch status:", response.data);
    } catch (error) {
      console.log("Prefetch error (non-critical):", error.message);
    }
  };

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
      await axios.post(`${API_URL}/api/dislike`, {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        userId: getCurrentUserId()
      });
      // Auto skip to next song after dislike
      handleNextSong();
    } catch (err) {
      console.error("Dislike failed:", err.message);
    }
  };

  const fetchStats = async (videoId) => {
    try {
      setStats(null);
      const res = await axios.get(`http://localhost:5000/api/song/${videoId}/stats`);
      setStats(res.data);
    } catch (err) {
      console.log(err);
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
                dislikedKeywords={dislikedKeywords}
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
