import { useState, useEffect } from "react";
import { getAllSongs, initDb } from "../services/dbService";

function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  const loadStats = async () => {
    try {
      const allSongs = await getAllSongs();
      const artists = new Set();
      const moods = new Set();
      
      allSongs.forEach(s => {
        if (s.artistNormalized) artists.add(s.artistNormalized);
        if (s.moodTags && Array.isArray(s.moodTags)) {
          s.moodTags.forEach(m => moods.add(m));
        }
      });

      const db = await initDb();

      setStats({
        dbVersion: db.version,
        storeNames: Array.from(db.objectStoreNames),
        totalSongs: allSongs.length,
        totalArtists: artists.size,
        totalMoods: moods.size,
        sampleArtists: Array.from(artists).slice(0, 5),
        sampleMoods: Array.from(moods).slice(0, 5)
      });
    } catch (e) {
      console.error("Failed to load debug stats:", e);
    }
  };

  return (
    <>
      <button 
        className="debug-panel-toggle" 
        onClick={() => setIsOpen(!isOpen)}
        title="DB Diagnostics (Ctrl+Shift+D)"
        style={{
          position: "fixed",
          bottom: "20px",
          left: "20px",
          zIndex: 9999,
          background: "rgba(15, 25, 50, 0.8)",
          border: "1px solid rgba(147, 51, 234, 0.5)",
          borderRadius: "50%",
          width: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: "1.2rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          color: "white"
        }}
      >
        🐛
      </button>

      {isOpen && (
        <div 
          className="debug-panel-modal"
          style={{
            position: "fixed",
            bottom: "80px",
            left: "20px",
            zIndex: 9999,
            background: "rgba(10, 15, 30, 0.95)",
            border: "1px solid rgba(147, 51, 234, 0.5)",
            borderRadius: "12px",
            padding: "20px",
            width: "320px",
            color: "#e0f2fe",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            backdropFilter: "blur(12px)",
            maxHeight: "80vh",
            overflowY: "auto"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(147,51,234,0.3)", paddingBottom: "10px", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, color: "#a855f7" }}>
              DB Diagnostics
            </h3>
            <button onClick={() => loadStats()} style={{ background: "transparent", border: "1px solid #38bdf8", color: "#38bdf8", borderRadius: "4px", cursor: "pointer", padding: "2px 8px" }}>
              Refresh
            </button>
          </div>
          
          {!stats ? (
            <p>Loading stats...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div><strong>DB Version:</strong> {stats.dbVersion}</div>
              <div><strong>Store Names:</strong> {stats.storeNames.join(", ")}</div>
              <div><strong>Total Songs:</strong> {stats.totalSongs}</div>
              <div><strong>Indexed Artists:</strong> {stats.totalArtists}</div>
              <div><strong>Indexed Moods:</strong> {stats.totalMoods}</div>
              
              <div style={{ marginTop: "10px" }}>
                <strong style={{ color: "#38bdf8" }}>Sample Artists:</strong>
                <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                  {stats.sampleArtists.map(a => <li key={a}>{a}</li>)}
                  {stats.sampleArtists.length === 0 && <li style={{color: "#ef4444"}}>None</li>}
                </ul>
              </div>

              <div>
                <strong style={{ color: "#38bdf8" }}>Sample Moods:</strong>
                <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                  {stats.sampleMoods.map(m => <li key={m}>{m}</li>)}
                  {stats.sampleMoods.length === 0 && <li style={{color: "#ef4444"}}>None</li>}
                </ul>
              </div>

              <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#94a3b8" }}>
                Press <code>Ctrl+Shift+D</code> to toggle
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default DebugPanel;
