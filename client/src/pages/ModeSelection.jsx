import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

function ModeSelection({ artists }) {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <Navbar />
      <div className="bg-overlay" />
      <div className="animated-gradient" />

      <section className="landing-content fade-in" style={{ marginTop: '4rem' }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Select Mode</h1>
        <p style={{ color: "#a1d5e6", marginBottom: "3rem" }}>Choose how you'd like to experience your music today.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem", justifyContent: "center", maxWidth: "800px", margin: "0 auto" }}>
          
          <div 
            className="player-card glass" 
            style={{ padding: "2.5rem 2rem", cursor: "pointer", transition: "transform 0.3s ease, box-shadow 0.3s ease", border: "1.5px solid rgba(147, 51, 234, 0.4)" }}
            onClick={() => navigate("/home")}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-10px)"; e.currentTarget.style.boxShadow = "0 30px 60px rgba(1, 4, 16, 0.6), 0 0 40px rgba(147, 51, 234, 0.6)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 35px 70px rgba(1, 4, 16, 0.6), 0 0 40px rgba(147, 51, 234, 0.25)"; }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "iconBob 3s ease-in-out infinite" }}>🎭</div>
            <h3 style={{ fontSize: "1.8rem", color: "#e0f2fe", marginBottom: "0.8rem", fontWeight: "700" }}>Mood Based</h3>
            <p style={{ color: "#bae6fd", lineHeight: "1.6", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
              Mix songs intelligently based on your current vibe blended with your chosen favorite artists.
            </p>
            <button className="blend-start-btn" style={{ width: "100%", padding: "0.8rem", fontSize: "1rem", fontWeight: "600", border: '1px solid rgba(147, 51, 234, 0.5)' }}>
              Start Mood Mix
            </button>
          </div>

          <div 
            className="player-card glass" 
            style={{ padding: "2.5rem 2rem", cursor: "pointer", transition: "transform 0.3s ease, box-shadow 0.3s ease", border: "1.5px solid rgba(34, 149, 255, 0.4)" }}
            onClick={() => navigate("/solo")}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-10px)"; e.currentTarget.style.boxShadow = "0 30px 60px rgba(1, 4, 16, 0.6), 0 0 40px rgba(34, 149, 255, 0.6)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 35px 70px rgba(1, 4, 16, 0.6), 0 0 40px rgba(147, 51, 234, 0.25)"; }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "iconBob 3s ease-in-out infinite 0.5s" }}>🎤</div>
            <h3 style={{ fontSize: "1.8rem", color: "#e0f2fe", marginBottom: "0.8rem", fontWeight: "700" }}>Artist Solo Mode</h3>
            <p style={{ color: "#bae6fd", lineHeight: "1.6", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
              Pure, unfiltered focus. Listen strictly to tracks produced by your curated selection of favorite artists.
            </p>
            <button className="blend-start-btn" style={{ width: "100%", padding: "0.8rem", fontSize: "1rem", fontWeight: "600", background: "linear-gradient(135deg, rgba(34, 149, 255, 0.28), rgba(22, 163, 74, 0.25))", border: '1px solid rgba(34, 149, 255, 0.5)' }}>
              Start Solo Mode
            </button>
          </div>

        </div>
      </section>
    </div>
  );
}

export default ModeSelection;
