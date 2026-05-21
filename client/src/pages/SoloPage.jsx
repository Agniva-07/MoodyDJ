import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Navbar from "../components/Navbar";
import PlayerCard from "../components/PlayerCard";
import QueuePanel from "../components/QueuePanel";
import { saveHistory, addListeningTime } from "../services/userService";
import { useArtists } from "../context/ArtistContext";
import { useToast } from "../context/ToastContext";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const deduplicateSongs = (songs) => {
  const map = new Map();
  songs.forEach((song) => {
    if (!map.has(song.videoId)) {
      map.set(song.videoId, song);
    }
  });
  return Array.from(map.values());
};

const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

function SoloPage() {
  // 1. Restore queue synchronously on startup from localStorage (Requirement 2)
  const [songs, setSongs] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_solo_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.songs && parsed.songs.length > 0) return parsed.songs;
      }
    } catch (e) {}
    return [];
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("moodydj_solo_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentIndex !== undefined) return parsed.currentIndex;
      }
    } catch (e) {}
    return 0;
  });

  const [stats, setStats] = useState(null);
  const [shuffle, setShuffle] = useState(false);
  const [recentSongs, setRecentSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [refilling, setRefilling] = useState(false);

  const playerRef = useRef(null);
  const lastSavedVideoRef = useRef(null);
  const saveHistoryTimeoutRef = useRef(null);
  const hasShownQuotaWarningRef = useRef(false);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedArtists, getArtistNames, artistsLoaded } = useArtists();

  const getCurrentUserId = () => {
    try {
      const rawUser = localStorage.getItem("user");
      return rawUser ? JSON.parse(rawUser)?.uid || "" : "";
    } catch {
      return "";
    }
  };

  useEffect(() => {
    const existing = localStorage.getItem("sessionId");
    if (existing) setSessionId(existing);
    
    try {
      const saved = localStorage.getItem("moodydj_solo_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.songs && parsed.songs.length > 0) {
          console.log(`🔌 [QUEUE RESTORATION] Restored solo queue from localStorage: ${parsed.songs.length} songs, currentIndex: ${parsed.currentIndex ?? 0}`);
        }
      }
    } catch (e) {}
  }, []);

  const handleLike = async () => {
    const song = songs[currentIndex];
    if (!song) return;
    setLiked(prev => !prev);
    try {
      await axios.post("http://localhost:5000/api/like", {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail,
        userId: getCurrentUserId()
      });
    } catch (err) {
      console.error("Solo Like failed:", err);
    }
  };

  const handleDislike = async () => {
    const song = songs[currentIndex];
    if (!song) return;
    setDisliked(true);
    try {
      await axios.post("http://localhost:5000/api/dislike", {
        sessionId,
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        userId: getCurrentUserId()
      });
      handleNextSong();
    } catch (err) {
      console.error("Solo Dislike failed:", err);
    }
  };
  useEffect(() => {
    if (!artistsLoaded) return;

    if (selectedArtists.length === 0) {
      navigate("/home");
      return;
    }

    const currentArtistsStr = JSON.stringify(selectedArtists);
    
    // Check if the current songs in state match the selected artists.
    // If they do, we don't need to fetch!
    let isValid = false;
    try {
      const savedQueue = localStorage.getItem("moodydj_solo_queue");
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        if (parsed.songs && parsed.songs.length > 0 && parsed.selectedArtistsStr === currentArtistsStr) {
          isValid = true;
        }
      }
    } catch (e) {}

    if (isValid) {
      setLoading(false);
      
      // Fetch initial history
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        getDoc(doc(db, "users", user.uid)).then(snap => {
          if (snap.exists() && snap.data().history) {
            setRecentSongs(snap.data().history);
          }
        }).catch(err => console.log("Failed to load initial history:", err));
      }
      return;
    }

    const fetchSoloMix = async () => {
      try {
        setLoading(true);

        const artistNames = getArtistNames();

        const { data } = await axios.post("http://localhost:5000/api/solo-songs", {
          selectedArtists: artistNames,
          userId: getCurrentUserId(),
        });

        const isQuotaSafeMode = data.meta?.quotaSafeMode || data.quotaSafeMode;
        if (isQuotaSafeMode && !hasShownQuotaWarningRef.current) {
          showToast("Using cached music library to preserve API quota.", "info");
          hasShownQuotaWarningRef.current = true;
        }

        if (data.songs && data.songs.length > 0) {
          setSongs(deduplicateSongs(data.songs));
          setCurrentIndex(0);
        } else {
          setError("No songs found.");
        }
      } catch (err) {
        console.error("FULL ERROR:", err.response?.data || err.message);
        setError(err.response?.data?.error || "Failed to fetch songs.");
      } finally {
        setLoading(false);
      }
    };

    fetchSoloMix();

    // Fetch initial history
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      getDoc(doc(db, "users", user.uid)).then(snap => {
        if (snap.exists() && snap.data().history) {
          setRecentSongs(snap.data().history);
        }
      }).catch(err => console.log("Failed to load initial history:", err));
    }

  }, [artistsLoaded, selectedArtists, navigate, getArtistNames]);

  // 2. Persist queue whenever it changes (Throttled/Debounced - Requirement 5)
  const saveQueueDebounced = useRef(
    debounce((queueData) => {
      try {
        localStorage.setItem("moodydj_solo_queue", JSON.stringify(queueData));
      } catch (e) {
        console.error("Failed to persist solo queue:", e);
      }
    }, 1000)
  ).current;

  useEffect(() => {
    if (songs.length > 0 && selectedArtists.length > 0) {
      saveQueueDebounced({
        songs,
        currentIndex,
        selectedArtistsStr: JSON.stringify(selectedArtists)
      });
    }
  }, [songs, currentIndex, selectedArtists]);

  // 🎵 HANDLE SONG CHANGE
  useEffect(() => {
    if (!songs.length) return;

    const currentSong = songs[currentIndex];

    setLiked(false);
    setDisliked(false);

    fetchStats(currentSong.videoId);

    // Clear any pending history write timeout
    if (saveHistoryTimeoutRef.current) {
      clearTimeout(saveHistoryTimeoutRef.current);
    }

    // Schedule history write after 20 seconds of continuous playback
    saveHistoryTimeoutRef.current = setTimeout(() => {
      if (lastSavedVideoRef.current !== currentSong.videoId) {
        lastSavedVideoRef.current = currentSong.videoId;

        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);

          saveHistory(user.uid, currentSong)
            .then((history) => {
              if (history) setRecentSongs(history);
            })
            .catch(console.error);
        }
      }
    }, 20000); // 20 seconds debounce

    return () => {
      if (saveHistoryTimeoutRef.current) {
        clearTimeout(saveHistoryTimeoutRef.current);
      }
    };
  }, [currentIndex, songs]);

  // Disabled automatic queue refill to adhere to new requirement:
  // "Automatic refreshes should NOT happen anymore"
  // "Queue/list regeneration should happen ONLY on explicit user action"
  /* useEffect(() => { ... refill logic ... }, [currentIndex, songs.length, refilling]); */

  const handleNextSong = () => {
    if (!songs.length) return;

    const nextIndex = shuffle
      ? Math.floor(Math.random() * songs.length)
      : (currentIndex + 1) % songs.length;

    setCurrentIndex(nextIndex);
  };

  const handlePrevSong = () => {
    if (!songs.length) return;

    setCurrentIndex((currentIndex - 1 + songs.length) % songs.length);
  };

  const handleAddToQueue = (song) => {
    setSongs(prev => {
      if (prev.length > 0 && prev[prev.length - 1].videoId === song.videoId) {
        return prev;
      }
      return [...prev, song];
    });
  };

  const handleRefreshList = async () => {
    console.log("🔄 [REFRESH LIST] Solo Mode refresh triggered. Source: cachedSongsPool (localStorage/session cache). No API calls.");
    // 1. Zero-network refresh using master cachedSongsPool
    let pool = songs;
    try {
      const stored = localStorage.getItem("moodydj_cached_pool");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 10) pool = parsed;
      }
    } catch {}

    if (!pool || pool.length === 0) return;

    // 2. Preserve queue stability: Keep songs up to currentIndex intact
    setSongs(prev => {
      const safeIndex = currentIndex >= 0 && currentIndex < prev.length ? currentIndex : 0;
      const beforeAndCurrent = prev.slice(0, safeIndex + 1);
      
      // Filter out songs that are already in the kept portion of the queue
      const keptIds = new Set(beforeAndCurrent.map(s => s.videoId));
      const remainingPool = pool.filter(s => !keptIds.has(s.videoId));
      
      // Fisher-Yates shuffle the remaining pool
      const shuffled = [...remainingPool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      // Append a fresh list (e.g. 40 songs) after the current song
      const newList = shuffled.slice(0, 40);
      return [...beforeAndCurrent, ...newList];
    });
  };

  const fetchStats = async (videoId) => {
    try {
      setStats(null);
      const res = await axios.get(`http://localhost:5000/api/song/${videoId}/stats`);
      setStats(res.data);
    } catch (err) {
      console.log("Stats error:", err);
    }
  };

  // 🟡 LOADING
  if (!artistsLoaded || loading) {
    return (
      <div className="landing-page">
        <Navbar />
        <h2>Loading your mix...</h2>
      </div>
    );
  }

  // 🔴 ERROR
  if (error || songs.length === 0) {
    return (
      <div className="landing-page">
        <Navbar />
        <h2>{error || "No songs available"}</h2>
        <button onClick={() => navigate("/mode-select")}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="player-page">
      <Navbar />

      <main className="player-layout">

        {/* 🎵 PLAYER CARD (ONLY PLAYER NOW) */}
        <PlayerCard
          song={songs[currentIndex]}
          stats={stats}
          shuffle={shuffle}
          onPrev={handlePrevSong}
          onNext={handleNextSong}
          onShuffle={() => setShuffle(!shuffle)}
          liked={liked}
          disliked={disliked}
          onLike={handleLike}
          onDislike={handleDislike}
          likedKeywords={[]}
          dislikedKeywords={[]}
          playerRef={playerRef}
          onAddToQueue={handleAddToQueue}
          onRefreshList={handleRefreshList}
        />

        {/* 📜 QUEUE */}
        <QueuePanel
          songs={songs}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
          recentSongs={recentSongs}
          onAddToQueue={handleAddToQueue}
          onRefreshList={handleRefreshList}
        />

      </main>
    </div>
  );
}

export default SoloPage;
