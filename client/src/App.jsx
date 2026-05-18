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
import { ARTISTS_DATA } from "./data/artists";
import { useArtists } from "./context/ArtistContext";
import { saveHistory, getUserData } from "./services/userService";
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

function App() {
  const navigate = useNavigate();
  const [selectedMood, setSelectedMood] = useState(null);
  const [blendConfig, setBlendConfig] = useState({
    mood1: "chill",
    mood2: "focus",
    weight1: 60,
    weight2: 40,
  });
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [playedIds, setPlayedIds] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [likedSongs, setLikedSongs] = useState([]);
  const [likedKeywords, setLikedKeywords] = useState([]);
  const [dislikedKeywords, setDislikedKeywords] = useState([]);
  const [recentSongs, setRecentSongs] = useState([]);
  const [sessionId, setSessionId] = useState("");
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
    setSessionId(getOrCreateSessionId());
    const savedLiked = localStorage.getItem("likedSongs");
    if (savedLiked) setLikedSongs(JSON.parse(savedLiked));
  }, []);

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
    
    // Save to history/recent (prevent duplicate saves)
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
  useEffect(() => {
    if (!selectedMood || !sessionId) return;

    // Prefetch songs periodically (every 30 seconds as fallback)
    const interval = setInterval(() => {
      prefetchNextSongs();
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId, selectedMood]);

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
