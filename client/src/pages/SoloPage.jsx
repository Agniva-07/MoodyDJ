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

// Deduplicate songs by videoId using Map
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
  const [isPlaying, setIsPlaying] = useState(true);
  const [stats, setStats] = useState(null);
  const [shuffle, setShuffle] = useState(false);
  const [recentSongs, setRecentSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);

  const playerRef = useRef(null);
  const lastSavedVideoRef = useRef(null);
  const songStartTimeRef = useRef(null);
  const accumulatedTimeRef = useRef(0); // FIX 4: Batching buffer
  const accumulatedSongsRef = useRef(0);
  const navigate = useNavigate();
  const { selectedArtists, getArtistNames, artistsLoaded } = useArtists();

  // FIX 4: Flush accumulated listening time to Firestore
  const flushListeningTime = useCallback(() => {
    if (accumulatedTimeRef.current <= 0) return;

    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      addListeningTime(user.uid, accumulatedTimeRef.current);
    }
    accumulatedTimeRef.current = 0;
    accumulatedSongsRef.current = 0;
  }, []);

  // Track current song's elapsed time into the buffer
  const trackAndSave = useCallback(() => {
    if (songStartTimeRef.current) {
      const elapsed = (Date.now() - songStartTimeRef.current) / 1000;
      songStartTimeRef.current = null;
      if (elapsed > 5) {
        accumulatedTimeRef.current += elapsed;
        accumulatedSongsRef.current += 1;

        // FIX 4: Flush every 30s accumulated OR 3 songs
        if (accumulatedTimeRef.current > 30 || accumulatedSongsRef.current >= 3) {
          flushListeningTime();
        }
      }
    }
  }, [flushListeningTime]);

  // FIX 3: Save on tab close / refresh
  useEffect(() => {
    const handleUnload = () => {
      trackAndSave();
      flushListeningTime();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [trackAndSave, flushListeningTime]);

  // FIX 2: Wait for context to load before fetching
  useEffect(() => {
    if (!artistsLoaded) return;

    // FIX 6: If no artists → redirect to /home (mood mode fallback)
    if (selectedArtists.length === 0) {
      navigate("/home");
      return;
    }

    const fetchSoloMix = async () => {
      const userStr = localStorage.getItem("user");
      let uid = "";
      if (userStr) {
        uid = JSON.parse(userStr).uid;
      }

      console.log("Artists:", selectedArtists);
      const artistsSignature = selectedArtists.join("-");
      const artists = getArtistNames();
      const today = new Date().toISOString().split("T")[0];
      const cacheKey = `dailyMix:${uid}:${today}:${artistsSignature}`;

      try {
        setLoading(true);

        // Firestore-based Daily Mix Cache
        if (uid) {
          try {
            const cacheRef = doc(db, "users", uid, "dailyMix", "current");
            const snap = await getDoc(cacheRef);
            if (snap.exists() && snap.data().date === today && snap.data().artistsSignature === artistsSignature && snap.data().songs && snap.data().songs.length > 0) {
              console.log("Using cache for artists:", artistsSignature);
              setSongs(deduplicateSongs(snap.data().songs));
              setLoading(false);
              return;
            }
          } catch (cacheErr) {
            console.warn("Firestore cache read failed, proceeding to fetch:", cacheErr);
          }
        } else {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            setSongs(deduplicateSongs(JSON.parse(cached)));
            setLoading(false);
            return;
          }
        }

        const { data } = await axios.post("http://localhost:5000/api/solo-songs", {
          selectedArtists: artists,
        });

        if (data.songs && data.songs.length > 0) {
          const cleanSongs = deduplicateSongs(data.songs);
          setSongs(cleanSongs);

          // Save to cache (wrapped in try/catch — FIX 7)
          try {
            if (uid) {
              const cacheRef = doc(db, "users", uid, "dailyMix", "current");
              await setDoc(cacheRef, { date: today, artistsSignature, songs: cleanSongs }, { merge: true });
            } else {
              localStorage.setItem(cacheKey, JSON.stringify(cleanSongs));
            }
          } catch (writeErr) {
            console.warn("Cache write failed (non-critical):", writeErr);
          }
        } else {
          setError("No results found for these artists.");
        }
      } catch (err) {
        console.error("Solo mode fetch failed:", err);
        setError("Network error. Unable to build your solo mix.");
      } finally {
        setLoading(false);
      }
    };

    fetchSoloMix();
  }, [artistsLoaded, selectedArtists, navigate, getArtistNames]);

  useEffect(() => {
    if (songs.length === 0) return;

    const createPlayer = () => {
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch (e) { console.log(e); }
      }
      playerRef.current = new window.YT.Player("player-solo", {
        videoId: songs[0].videoId,
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            event.target.setVolume(50);
            event.target.playVideo();
            songStartTimeRef.current = Date.now();
          },
          onStateChange: (event) => {
            if (event.data === 0) handleNextSong();
            // FIX 3: Start timer only when video ACTUALLY plays
            if (event.data === 1) {
              setIsPlaying(true);
              if (!songStartTimeRef.current) songStartTimeRef.current = Date.now();
            }
            // FIX 3: Pause timer on pause
            if (event.data === 2) {
              setIsPlaying(false);
              if (songStartTimeRef.current) {
                accumulatedTimeRef.current += (Date.now() - songStartTimeRef.current) / 1000;
                songStartTimeRef.current = null;
              }
            }
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
  }, [songs]);

  useEffect(() => {
    if (playerRef.current && songs.length > 0) {
      const nowPlaying = songs[currentIndex];

      // Track time from previous song
      trackAndSave();

      if (typeof playerRef.current.loadVideoById === "function") {
        playerRef.current.loadVideoById(nowPlaying.videoId);
      }

      setLiked(false);
      fetchStats(nowPlaying.videoId);
      songStartTimeRef.current = Date.now();

      if (lastSavedVideoRef.current !== nowPlaying.videoId) {
        lastSavedVideoRef.current = nowPlaying.videoId;
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          saveHistory(user.uid, nowPlaying).then((history) => {
            if (history) setRecentSongs(history);
          }).catch(console.error);
        }
      }
    }
  }, [currentIndex, songs, trackAndSave]);

  // Flush remaining time on unmount
  useEffect(() => {
    return () => {
      trackAndSave();
      flushListeningTime();
    };
  }, [trackAndSave, flushListeningTime]);

  const handleNextSong = () => {
    if (songs.length === 0) return;
    let nextIndex = shuffle
      ? Math.floor(Math.random() * songs.length)
      : (currentIndex + 1) % songs.length;
    setCurrentIndex(nextIndex);
  };

  const handlePrevSong = () => {
    if (songs.length === 0) return;
    setCurrentIndex((currentIndex - 1 + songs.length) % songs.length);
  };

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

  const fetchStats = async (videoId) => {
    try {
      setStats(null);
      const res = await axios.get("http://localhost:5000/api/song/" + videoId + "/stats");
      setStats(res.data);
    } catch (err) {
      console.log("Stats fetch err:", err);
    }
  };

  // FIX 2: Show loader while context loads
  if (!artistsLoaded || loading) {
    return (
      <div className="landing-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Navbar />
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: "center" }}>
          <h2 style={{ color: "#e0f2fe", marginBottom: "1rem", animation: "pulse 1.5s infinite", fontSize: "2rem" }}>Building Your Daily Mix...</h2>
          <div className="loading-indicator" style={{ display: "inline-block", fontSize: "1.2rem", marginTop: "1rem" }}>Please wait</div>
        </div>
      </div>
    );
  }

  if (error || songs.length === 0) {
    return (
      <div className="landing-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Navbar />
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: "center" }}>
          <h2 style={{ color: "#ef4444", marginBottom: "1rem", fontSize: "2rem" }}>Error</h2>
          <p style={{ color: "#bae6fd", fontSize: "1.1rem" }}>{error || "No songs available."}</p>
          <button className="blend-start-btn" onClick={() => navigate("/mode-select")} style={{ marginTop: "2rem" }}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="player-page">
      <Navbar />
      <div id="player-solo" style={{ display: "none" }}></div>
      <main className="player-layout">
        <PlayerCard
          song={songs[currentIndex]}
          isPlaying={isPlaying}
          stats={stats}
          shuffle={shuffle}
          onPlayPause={handlePlayPause}
          onPrev={handlePrevSong}
          onNext={handleNextSong}
          onShuffle={() => setShuffle(!shuffle)}
          liked={liked}
          onLike={() => setLiked(!liked)}
          onDislike={() => handleNextSong()}
        />
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
