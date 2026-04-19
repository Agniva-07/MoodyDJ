import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { logoutUser } from "../services/authService";

function Navbar({ moods, activeMood, onMoodSelect }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = () => {
      const stored = localStorage.getItem("user");
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser(null);
      }
    };
    checkUser();
    const interval = setInterval(checkUser, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    navigate("/login");
  };

  return (
    <header className="navbar" style={{ width: "100%", top: 0, left: 0, padding: "1.5rem 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", position: "fixed", zIndex: 50, boxSizing: "border-box" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "1rem" }}>
        {moods && (
          <>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Toggle mood menu"
            >
              <span />
              <span />
              <span />
            </button>
            {open ? (
              <div className="mood-dropdown fade-in" style={{ top: "70px", left: "0" }}>
                {moods.map((mood) => (
                  <button
                    key={mood.id}
                    type="button"
                    className={`dropdown-item ${activeMood === mood.id ? "active" : ""}`}
                    onClick={() => {
                      onMoodSelect(mood.id);
                      setOpen(false);
                    }}
                  >
                    <span>{mood.icon}</span>
                    {mood.title}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        <div className="logo" style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => navigate("/home")}>
          <h2 style={{ fontSize: "1.5rem", margin: 0, fontWeight: "700", background: "linear-gradient(135deg, #e0f2fe, #a1d5e6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MoodyDJ</h2>
        </div>
      </div>

      <div className="nav-right" style={{ position: "relative" }}>
        {user ? (
          <div>
            <div 
              style={{ display: "flex", alignItems: "center", gap: "0.8rem", cursor: "pointer", background: "rgba(15, 25, 50, 0.4)", border: "1px solid rgba(147, 51, 234, 0.3)", padding: "0.4rem 0.8rem", borderRadius: "30px", backdropFilter: "blur(10px)" }}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <img src={user.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt="profile" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} />
              <span style={{ color: "#e0f2fe", fontSize: "0.9rem", fontWeight: "500", marginRight: "0.2rem" }}>{user.displayName || "User"}</span>
            </div>

            {profileOpen && (
              <div className="mood-dropdown fade-in" style={{ top: "50px", right: "0", left: "auto", width: "160px" }}>
                <div className="dropdown-item" onClick={() => { setProfileOpen(false); navigate("/profile"); }}>
                  View Profile
                </div>
                <div className="dropdown-item" onClick={() => { setProfileOpen(false); handleLogout(); }}>
                  Logout
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="blend-start-btn" style={{ textDecoration: "none", display: "inline-block", margin: 0 }}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}

export default Navbar;
