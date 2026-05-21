import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ArtistSelection from "../components/ArtistSelection";
import PlaylistCard from "../components/playlist/PlaylistCard";
import CreatePlaylistModal from "../components/playlist/CreatePlaylistModal";
import AddToPlaylistModal from "../components/playlist/AddToPlaylistModal";
import SongMenu from "../components/SongMenu";
import { useArtists } from "../context/ArtistContext";
import { usePlaylist } from "../context/PlaylistContext";
import { getUserData, getLikedSongs, syncAndGetHistory } from "../services/userService";
import { ARTISTS_DATA } from "../data/artists";

function ProfilePage({ onAddToQueue }) {
  const navigate = useNavigate();
  const { selectedArtists, setSelectedArtists } = useArtists();
  const { playlists, playlistsLoaded, fetchPlaylists } = usePlaylist();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [likedSongsData, setLikedSongsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArtistEditor, setShowArtistEditor] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playlistSong, setPlaylistSong] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const userStr = localStorage.getItem("user");
      if (!userStr) {
        navigate("/login");
        return;
      }
      const parsedUser = JSON.parse(userStr);
      setUser(parsedUser);

      try {
        const data = await getUserData(parsedUser.uid);
        if (data) {
          const mergedHistory = syncAndGetHistory(parsedUser.uid, data.history || data.recentSongs || []);
          data.history = mergedHistory;
          data.recentSongs = mergedHistory;
        }
        setUserData(data);
        
        // Fetch liked songs
        const likedSongs = await getLikedSongs(parsedUser.uid);
        setLikedSongsData(likedSongs);

        // Fetch playlists
        if (!playlistsLoaded) {
          fetchPlaylists();
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate, playlistsLoaded, fetchPlaylists]);

  const handleArtistUpdate = (artists) => {
    setSelectedArtists(artists);
    setShowArtistEditor(false);
  };

  const resolveArtistName = (id) => {
    const found = ARTISTS_DATA.find((a) => a.id === id);
    return found ? found.name : id;
  };

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

  if (loading) {
    return (
      <div className="landing-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Navbar />
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: "center" }}>
          <h2 style={{ color: "#e0f2fe", animation: "pulse 1.5s infinite", fontSize: "2rem" }}>Loading Profile...</h2>
        </div>
      </div>
    );
  }

  if (showArtistEditor) {
    return (
      <ArtistSelection
        initialSelected={selectedArtists}
        prewarmedIds={getPrewarmedArtistIds()}
        onComplete={handleArtistUpdate}
      />
    );
  }

  const history = userData?.recentSongs || userData?.history || [];
  const liked = likedSongsData || [];
  const disliked = userData?.disliked || [];
  const totalSongsPlayed = userData?.totalSongsPlayed || history.length;
  const totalListeningMinutes = userData?.totalListeningTime
    ? Math.round(userData.totalListeningTime / 60)
    : 0;

  return (
    <div className="landing-page">
      <Navbar />
      <div className="bg-overlay" />
      <div className="animated-gradient" />

      <section className="landing-content fade-in" style={{ marginTop: "5rem", padding: "0 2rem" }}>
        {/* User Info */}
        <div className="player-card glass" style={{ maxWidth: "700px", margin: "0 auto 2rem", padding: "2rem", display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <img
            src={user?.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
            alt="avatar"
            style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(147,51,234,0.5)" }}
          />
          <div>
            <h2 style={{ color: "#e0f2fe", margin: 0, fontSize: "1.6rem" }}>{user?.displayName || "User"}</h2>
            <p style={{ color: "#94a3b8", margin: "0.3rem 0 0", fontSize: "0.9rem" }}>{user?.email || ""}</p>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", maxWidth: "700px", margin: "0 auto 2rem" }}>
          {[
            { icon: "🎧", label: "Songs Played", value: totalSongsPlayed },
            { icon: "⏱", label: "Listening", value: totalListeningMinutes > 60 ? `${Math.floor(totalListeningMinutes / 60)}h ${totalListeningMinutes % 60}m` : `${totalListeningMinutes}m` },
            { icon: "❤️", label: "Likes", value: liked.length },
            { icon: "👎", label: "Dislikes", value: disliked.length },
          ].map((stat) => (
            <div key={stat.label} className="player-card glass" style={{ padding: "1.2rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>{stat.icon}</div>
              <div style={{ color: "#e0f2fe", fontSize: "1.5rem", fontWeight: "700" }}>{stat.value}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.2rem" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Selected Artists */}
        <div className="player-card glass" style={{ maxWidth: "700px", margin: "0 auto 2rem", padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <h3 style={{ color: "#e0f2fe", margin: 0, fontSize: "1.2rem" }}>🎤 Your Artists</h3>
            <button
              className="blend-start-btn"
              onClick={() => setShowArtistEditor(true)}
              style={{ padding: "0.5rem 1.2rem", fontSize: "0.85rem", margin: 0 }}
            >
              Edit Artists 🎯
            </button>
          </div>

          {selectedArtists.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No artists selected yet.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
              {selectedArtists.map((id) => (
                <span
                  key={id}
                  style={{
                    background: "rgba(147, 51, 234, 0.2)",
                    border: "1px solid rgba(147, 51, 234, 0.4)",
                    color: "#e0f2fe",
                    padding: "0.4rem 0.9rem",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {resolveArtistName(id)}
                  <span
                    onClick={() => {
                      if (selectedArtists.length > 3) {
                        setSelectedArtists(selectedArtists.filter((a) => a !== id));
                      }
                    }}
                    style={{
                      cursor: selectedArtists.length > 3 ? "pointer" : "not-allowed",
                      opacity: selectedArtists.length > 3 ? 1 : 0.3,
                      fontSize: "0.75rem",
                    }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* My Playlists */}
        <div className="player-card glass" style={{ maxWidth: "700px", margin: "0 auto 2rem", padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <h3 style={{ color: "#e0f2fe", margin: 0, fontSize: "1.2rem" }}>📂 My Playlists</h3>
            <button 
              className="blend-start-btn" 
              style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}
              onClick={() => setShowCreateModal(true)}
            >
              + Create Playlist
            </button>
          </div>
          
          {!playlistsLoaded ? (
            <p style={{ color: "#94a3b8" }}>Loading playlists...</p>
          ) : playlists.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No playlists yet. Create one to start saving your favorite mixes!</p>
          ) : (
            <div className="playlist-grid">
              {playlists.map(p => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </div>
          )}
        </div>

        {/* Liked Songs Library */}
        <div className="player-card glass" style={{ maxWidth: "700px", margin: "0 auto 2rem", padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <h3 style={{ color: "#e0f2fe", margin: 0, fontSize: "1.2rem" }}>❤️ Liked Songs</h3>
          </div>
          {liked.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No liked songs yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.8rem" }}>
              {liked.slice(0, 10).map((song) => (
                <div key={song.videoId} className="liked-song-card" style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: "8px", position: "relative" }}>
                  <img src={song.thumbnail} alt="" style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px" }} />
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <h4 style={{ margin: 0, color: "#e0f2fe", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{song.title}</h4>
                    <p style={{ margin: "0.1rem 0 0", color: "#94a3b8", fontSize: "0.7rem" }}>{song.channelTitle}</p>
                  </div>
                  <SongMenu 
                    song={song}
                    onAddToQueue={onAddToQueue}
                    onAddToPlaylist={setPlaylistSong}
                  />
                </div>
              ))}
              {liked.length > 10 && (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem", textAlign: "center", marginTop: "1rem" }}>
                  + {liked.length - 10} more in your library
                </p>
              )}
            </div>
          )}
        </div>

        {/* Recently Played Songs */}
        <div className="player-card glass" style={{ maxWidth: "700px", margin: "0 auto 2rem", padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <h3 style={{ color: "#e0f2fe", margin: 0, fontSize: "1.2rem" }}>🎵 Recently Played</h3>
          </div>
          {history.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No recently played songs yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.8rem" }}>
              {history.slice(0, 10).map((song, index) => (
                <div key={`${song.videoId}-${index}`} className="recent-item" style={{ display: "flex", alignItems: "center", position: "relative" }}>
                  {song.thumbnail ? (
                    <img src={song.thumbnail} alt="" className="recent-item__thumb" />
                  ) : (
                    <div className="recent-item__thumb">
                      <span style={{ color: "#e0f2fe", fontSize: "1.2rem" }}>♪</span>
                    </div>
                  )}
                  <div className="recent-item__copy" style={{ flex: 1 }}>
                    <strong style={{ color: "#e0f2fe", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{song.title}</strong>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{song.channelTitle}</span>
                  </div>
                  <SongMenu 
                    song={song}
                    onAddToQueue={onAddToQueue}
                    onAddToPlaylist={setPlaylistSong}
                  />
                </div>
              ))}
              {history.length > 10 && (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem", textAlign: "center", marginTop: "1rem" }}>
                  + {history.length - 10} more in your history
                </p>
              )}
            </div>
          )}
        </div>

        {/* Navigation back */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <button
            className="blend-start-btn"
            onClick={() => navigate("/mode-select")}
            style={{ padding: "0.7rem 2rem", fontSize: "1rem" }}
          >
            ← Back to Modes
          </button>
        </div>
      </section>

      <CreatePlaylistModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
      <AddToPlaylistModal 
        isOpen={!!playlistSong} 
        song={playlistSong} 
        onClose={() => setPlaylistSong(null)} 
      />
    </div>
  );
}

export default ProfilePage;
