import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ArtistSelection from "../components/ArtistSelection";
import { useArtists } from "../context/ArtistContext";
import { getUserData } from "../services/userService";
import { ARTISTS_DATA } from "../data/artists";

function ProfilePage() {
  const navigate = useNavigate();
  const { selectedArtists, setSelectedArtists } = useArtists();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArtistEditor, setShowArtistEditor] = useState(false);

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
        setUserData(data);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate]);

  const handleArtistUpdate = (artists) => {
    setSelectedArtists(artists);
    setShowArtistEditor(false);
  };

  const resolveArtistName = (id) => {
    const found = ARTISTS_DATA.find((a) => a.id === id);
    return found ? found.name : id;
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
        onComplete={handleArtistUpdate}
      />
    );
  }

  const history = userData?.history || [];
  const liked = userData?.liked || [];
  const disliked = userData?.disliked || [];
  const totalSongsPlayed = history.length;
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
    </div>
  );
}

export default ProfilePage;
