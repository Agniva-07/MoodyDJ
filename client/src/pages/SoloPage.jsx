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

function SoloPage() {
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState(null);
  const [shuffle, setShuffle] = useState(false);
  const [recentSongs, setRecentSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);

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

  // 🎧 FETCH SONGS
  useEffect(() => {
    if (!artistsLoaded) return;

    if (selectedArtists.length === 0) {
      navigate("/home");
      return;
    }

    const fetchSoloMix = async () => {
      try {
        setLoading(true);

        const prewarmed = JSON.parse(localStorage.getItem('prewarmedArtists') || '[]');
        const artistNames = prewarmed.length > 0 ? prewarmed : getArtistNames();

        const { data } = await axios.post("http://localhost:5000/api/solo-songs", {
          selectedArtists: artistNames,
          userId: getCurrentUserId(),
        });

        if (data.songs && data.songs.length > 0) {
          setSongs(deduplicateSongs(data.songs));
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
  }, [artistsLoaded, selectedArtists, navigate, getArtistNames]);

  // 🎵 HANDLE SONG CHANGE
  useEffect(() => {
    if (!songs.length) return;

    const currentSong = songs[currentIndex];

    setLiked(false);

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
          onLike={() => setLiked(!liked)}
          likedKeywords={[]}
          dislikedKeywords={[]}
          playerRef={playerRef}
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
