import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import axios from "axios";
import LandingPage from "./pages/LandingPage";
import PlayerPage from "./pages/PlayerPage";
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
  const playerRef = useRef(null);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    const saved = localStorage.getItem("likedSongs");
    if (saved) setLikedSongs(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const loadRecent = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/recent?sessionId=${sessionId}`);
        setRecentSongs(res.data.recent || []);
      } catch (err) {
        console.log(err);
      }
    };
    loadRecent();
  }, [sessionId]);

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
      likedKeywords: liked.join(","),
      dislikedKeywords: disliked.join(","),
      sessionId, // ✅ Include sessionId for Auto-DJ queue management
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
    
    // ✅ FIXED: Properly initialize YouTube player and store instance
    const createPlayer = () => {
      if (playerRef.current && playerRef.current.destroy) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.log("Player destroy error:", e);
        }
      }
      
      playerRef.current = new window.YT.Player("player", {
        videoId: songs[0].videoId,
        events: {
          onReady: (event) => {
            // ✅ FIXED: Store the player instance from onReady
            playerRef.current = event.target;
            event.target.setVolume(50);
            console.log("✅ YouTube player ready:", event.target);
          },
          onStateChange: (event) => {
            if (event.data === 0 && autoPlay) handleNextSong();
            if (event.data === 1) setIsPlaying(true);
            if (event.data === 2) setIsPlaying(false);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = createPlayer;
    }
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
    if (playerRef.current && songs.length > 0) {
      const nowPlaying = songs[currentIndex];
      
      // ✅ FIXED: Check if player has loadVideoById before calling
      if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
        playerRef.current.loadVideoById(nowPlaying.videoId);
      }
      
      // ✅ NEW: Reset like state when song changes
      setLiked(false);
      
      fetchStats(nowPlaying.videoId);
      if (sessionId) {
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
            console.log(err);
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

  // Monitor playback progress for prefetch trigger
  useEffect(() => {
    if (!playerRef.current) return;

    const interval = setInterval(() => {
      const state = playerRef.current?.getPlayerState?.();
      const duration = playerRef.current?.getDuration?.();
      const currentTime = playerRef.current?.getCurrentTime?.();

      // Prefetch when 75% through the song
      if (
        state === 1 &&
        duration > 0 &&
        currentTime > (duration * 0.75)
      ) {
        prefetchNextSongs();
        clearInterval(interval);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [playerRef.current, sessionId, selectedMood]);

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    const state = playerRef.current.getPlayerState();
    if (state === 1) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
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

    try {
      // 🔥 STEP 1: Call backend to dislike and remove similar videos
      const dislikeRes = await axios.post("http://localhost:5000/api/dislike", {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
      });
      console.log("👎 Dislike registered:", dislikeRes.data);

      // 🔥 STEP 2: Clear local queue
      setSongs([]);
      setCurrentIndex(0);
      setPlayedIds(new Set());

      // 🔥 STEP 3: Fetch fresh songs from backend
      const requestParams = buildMoodRequestParams(selectedMood || blendConfig.mood1);
      const res = await axios.get("http://localhost:5000/api/songs", {
        params: requestParams,
      });
      
      const newSongs = res.data.songs || [];
      setSongs(newSongs);
      setCurrentIndex(0);

      // 🔥 STEP 4: Play first new song if available
      if (newSongs.length > 0 && playerRef.current && typeof playerRef.current.loadVideoById === "function") {
        console.log("▶️ Playing new song:", newSongs[0].videoId);
        playerRef.current.loadVideoById(newSongs[0].videoId);
        setLiked(false);
      }

      console.log("✅ Queue updated with", newSongs.length, "new songs");
    } catch (err) {
      console.error("❌ Dislike failed:", err);
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

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            moods={moods}
            selectedMood={selectedMood}
            loading={loading}
            blendConfig={blendConfig}
            onMoodSelect={handleMood}
          />
        }
      />
      <Route
        path="/player"
        element={
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
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
