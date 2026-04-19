import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signupWithEmail, loginWithGoogle } from "../services/authService";
import { getUserData } from "../services/userService";

function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuthSuccess = async (user) => {
    localStorage.setItem("user", JSON.stringify(user));
    
    try {
      // Load Firestore data and sync with localStorage safely
      const data = await getUserData(user.uid);
      if (data) {
        if (data.selectedArtists && data.selectedArtists.length > 0) {
          localStorage.setItem("selectedArtists", JSON.stringify(data.selectedArtists));
        }
        if (data.liked && data.liked.length > 0) {
          localStorage.setItem("likedSongs", JSON.stringify(data.liked));
        }
      }
    } catch (err) {
      console.warn("Could not sync profile details right after signup:", err);
    }
    navigate("/home");
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError("");
      const user = await loginWithGoogle();
      await handleAuthSuccess(user);
    } catch (err) {
      setError(err.message || "Failed to sign up with Google.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const user = await signupWithEmail(name, email, password);
      await handleAuthSuccess(user);
    } catch (err) {
      setError(err.message || "Failed to create an account.");
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">
      <style>{`
        @keyframes spinFix { 100% { transform: rotate(360deg); } }
        .spin-loader { display: inline-block; animation: spinFix 1s linear infinite; font-size: 1.1rem; }
      `}</style>
      <div className="bg-overlay" />
      <div className="animated-gradient" />
      <div className="player-card glass" style={{ maxWidth: "420px", width: "100%", zIndex: 2, padding: "2.5rem" }}>
        <h2 style={{ color: "#e0f2fe", marginBottom: "0.5rem", textAlign: "center", fontSize: "2rem" }}>Create Account</h2>
        <p style={{ color: "#a1d5e6", marginBottom: "2rem", textAlign: "center", fontSize: "0.9rem" }}>Join MoodyDJ and save your vibes</p>
        
        {error && <p style={{ color: "#ef4444", marginBottom: "1rem", fontSize: "0.9rem", textAlign: "center", background: "rgba(239, 68, 68, 0.1)", padding: "0.6rem", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>{error}</p>}
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
          <input 
            type="text" 
            placeholder="Full Name" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            style={{ padding: "0.85rem", borderRadius: "12px", background: "rgba(15, 25, 50, 0.45)", border: "1px solid rgba(147, 51, 234, 0.3)", color: "#fff", outline: "none", width: "100%", boxSizing: "border-box" }}
            required
            disabled={loading}
          />
          <input 
            type="email" 
            placeholder="Email address" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "0.85rem", borderRadius: "12px", background: "rgba(15, 25, 50, 0.45)", border: "1px solid rgba(147, 51, 234, 0.3)", color: "#fff", outline: "none", width: "100%", boxSizing: "border-box" }}
            required
            disabled={loading}
          />
          <input 
            type="password" 
            placeholder="Password (min 6 chars)" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "0.85rem", borderRadius: "12px", background: "rgba(15, 25, 50, 0.45)", border: "1px solid rgba(147, 51, 234, 0.3)", color: "#fff", outline: "none", width: "100%", boxSizing: "border-box" }}
            required
            minLength="6"
            disabled={loading}
          />
          <button type="submit" disabled={loading} className="blend-start-btn" style={{ width: "100%", padding: "0.85rem", marginTop: "0.5rem", fontSize: "1rem", fontWeight: "600", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? <span className="spin-loader">⏳</span> : "Sign Up"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", width: "100%", margin: "1.8rem 0" }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", height: "1px" }} />
          <span style={{ padding: "0 15px", color: "#94a3b8", fontSize: "0.85rem" }}>OR</span>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", height: "1px" }} />
        </div>

        <button onClick={handleGoogle} disabled={loading} className="queue-song" style={{ justifyContent: "center", width: "100%", border: "1px solid rgba(34, 149, 255, 0.4)", padding: "0.85rem", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          <span style={{ fontSize: "1.1rem", marginRight: "0.5rem" }}>G</span> Continue with Google
        </button>

        <p style={{ marginTop: "1.5rem", color: "#a1d5e6", fontSize: "0.95rem", textAlign: "center" }}>
          Already have an account? <Link to="/login" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: "600", pointerEvents: loading ? "none" : "auto" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default SignupPage;
