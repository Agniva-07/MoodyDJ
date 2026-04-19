import { useMemo, useState } from "react";
import Navbar from "../components/Navbar";

function LandingPage({ moods, selectedMood, loading, blendConfig, onMoodSelect, isPersonalized, onTogglePersonalized, onEditArtists, canPersonalize }) {
  
  const [mood1, setMood1] = useState(blendConfig?.mood1 || "chill");
  const [mood2, setMood2] = useState(blendConfig?.mood2 || "focus");
  const [weight1, setWeight1] = useState(blendConfig?.weight1 ?? 60);

  const weight2 = 100 - weight1;
  const secondMoodOptions = useMemo(() => moods.filter((mood) => mood.id !== mood1), [moods, mood1]);

  return (
    <div className="landing-page">
      <Navbar />
      <div className="bg-overlay" />
      <div className="animated-gradient" />

      <section className="landing-content fade-in" style={{ marginTop: '4rem' }}>

        <h1>MoodyDJ</h1>
        <p>Pick your vibe or blend two moods intelligently</p>

        <div className="personalized-toggle-container glass">
          <div className="toggle-info">
            <h3>Personalized Mode {isPersonalized && "🎯"}</h3>
            <p>Listen only to your selected favorite artists.</p>
          </div>
          <div className="toggle-actions">
            <button 
              className="edit-artists-btn" 
              onClick={onEditArtists}
            >
              Edit Artists
            </button>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={isPersonalized} 
                onChange={(e) => onTogglePersonalized(e.target.checked)} 
                disabled={!canPersonalize}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>

        <div className="mood-grid">
          {moods.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className="mood-card"
              onClick={() => onMoodSelect({ mood1: mood.id, mood2: "", weight1: 100, weight2: 0 })}
              disabled={loading && selectedMood === mood.id}
            >
              <span className="mood-icon">{mood.icon}</span>
              <h3>{mood.title}</h3>
              <p>{mood.subtitle}</p>
              {loading && selectedMood === mood.id ? (
                <span className="loading-indicator">Loading your session...</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="blend-panel glass">
          <h3>Mood Blend</h3>
          <p>Create a weighted mix for smarter recommendations.</p>

          <div className="blend-controls">
            <label>
              Primary Mood
              <select
                value={mood1}
                onChange={(event) => {
                  const nextMood1 = event.target.value;
                  setMood1(nextMood1);
                  if (nextMood1 === mood2) {
                    const fallback = moods.find((mood) => mood.id !== nextMood1)?.id || nextMood1;
                    setMood2(fallback);
                  }
                }}
              >
                {moods.map((mood) => (
                  <option key={`m1-${mood.id}`} value={mood.id}>
                    {mood.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Secondary Mood
              <select value={mood2} onChange={(event) => setMood2(event.target.value)}>
                {secondMoodOptions.map((mood) => (
                  <option key={`m2-${mood.id}`} value={mood.id}>
                    {mood.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="blend-slider-wrap">
            <div className="blend-values">
              <span>{mood1} ({weight1}%)</span>
              <span>{mood2} ({weight2}%)</span>
            </div>

            <input
              type="range"
              min="10"
              max="90"
              value={weight1}
              onChange={(event) => setWeight1(Number(event.target.value))}
            />
          </div>

          <button
            type="button"
            className="blend-start-btn"
            onClick={() => onMoodSelect({ mood1, mood2, weight1, weight2 })}
            disabled={loading}
          >
            Start Blended Session
          </button>
        </div>

      </section>
    </div>
  );
}

export default LandingPage;