import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Navbar from "../components/Navbar";
import PlayerCard from "../components/PlayerCard";
import QueuePanel from "../components/QueuePanel";
import { saveHistory, addListeningTime } from "../services/userService";
import { useArtists } from "../context/ArtistContext";
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

  const navigate = useNavigate();
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
      return;
    }

    // Fallback: If queue is somehow empty, fetch from API
    try {
      setLoading(true);
      const artistNames = getArtistNames();
      const { data } = await axios.post("http://localhost:5000/api/solo-songs", {
        selectedArtists: artistNames,
        userId: getCurrentUserId(),
      });
      if (data.songs && data.songs.length > 0) {
        setSongs(deduplicateSongs(data.songs));
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error("Refresh list failed:", err);
    } finally {
      setLoading(false);
    }
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
        />

      </main>
    </div>
  );
}

export default SoloPage;
