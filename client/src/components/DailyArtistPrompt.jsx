import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { ARTISTS_DATA } from '../data/artists';
import { useArtists } from '../context/ArtistContext';
import './DailyArtistPrompt.css';

const DailyArtistPrompt = () => {
  const {
    onboardingCompletedToday,
    onboardingChecked,
    completeOnboarding,
    selectedArtists,
  } = useArtists();

  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warmingProgress, setWarmingProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Don't show if onboarding check hasn't completed or already onboarded today
  if (!onboardingChecked || onboardingCompletedToday) return null;

  const toggleArtist = (artistId) => {
    setSelected(prev => {
      if (prev.includes(artistId)) {
        return prev.filter(a => a !== artistId);
      } else {
        if (prev.length >= 10) return prev;
        return [...prev, artistId];
      }
    });
  };

  const handleConfirm = async () => {
    if (selected.length < 3) return;

    setLoading(true);
    setWarmingProgress(0);

    const progressInterval = setInterval(() => {
      setWarmingProgress(prev => Math.min(prev + (100 / selected.length), 99));
    }, 600);

    try {
      // Resolve IDs to names for the prewarm API
      const artistNames = selected.map(id => {
        const found = ARTISTS_DATA.find(a => a.id === id);
        return found ? found.name : id;
      });

      // 1. Update unified context (writes selectedArtists + lastOnboardedDate to Firestore)
      await completeOnboarding(selected);

      // 2. Prewarm the backend cache with these artists
      await axios.post('http://localhost:5000/api/prewarm-artists', {
        artists: artistNames
      });

      clearInterval(progressInterval);
      setWarmingProgress(100);
      setSuccessMessage(`✅ ${artistNames.length * 75} songs loaded. Ready to play!`);

      // Store prewarm names for local reference
      localStorage.setItem('prewarmedArtists', JSON.stringify(artistNames));

    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      clearInterval(progressInterval);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    // Skip only allowed if user already has enough artists from a previous session
    if (selectedArtists.length < 3) return;

    try {
      // Mark today as onboarded using existing artists
      await completeOnboarding(selectedArtists);

      // Background prewarm
      const artistNames = selectedArtists.map(id => {
        const found = ARTISTS_DATA.find(a => a.id === id);
        return found ? found.name : id;
      });
      localStorage.setItem('prewarmedArtists', JSON.stringify(artistNames));

      axios.post('http://localhost:5000/api/prewarm-artists', {
        artists: artistNames
      }).catch(err => console.log("Background prewarm error:", err));
    } catch (err) {
      console.error("Skip onboarding failed:", err);
    }
  };

  // Filter artists by search term
  const filteredArtists = ARTISTS_DATA.filter(artist =>
    artist.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by category (preserve original order)
  const categories = [...new Set(ARTISTS_DATA.map(a => a.category))];

  return (
    <div className="daily-prompt-overlay">
      <div className="daily-prompt-modal">
        <h2>What are you listening to today?</h2>
        <p className="subtitle">
          Pick 3–10 artists to pre-load for today's sessions.
        </p>

        <div className="daily-prompt-search-container">
          <input
            type="text"
            className="daily-prompt-search"
            placeholder="Search artists..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="daily-prompt-categories-container">
          {categories.map(category => {
            const artistsInCategory = filteredArtists.filter(a => a.category === category);
            if (artistsInCategory.length === 0) return null;

            return (
              <div key={category} className="daily-prompt-category-section">
                <h3>{category}</h3>
                <div className="daily-prompt-grid">
                  {artistsInCategory.map(artist => {
                    const isSelected = selected.includes(artist.id);
                    return (
                      <div
                        key={artist.id}
                        className={`daily-prompt-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleArtist(artist.id)}
                      >
                        <div className="daily-prompt-image-wrapper">
                          <img src={artist.image} alt={artist.name} />
                          {isSelected && <div className="daily-prompt-checkmark">✓</div>}
                        </div>
                        <span>{artist.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {loading && warmingProgress > 0 && (
          <div className="prewarm-progress-container" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '8px' }}>
              Pre-warming artists...
            </p>
            <div style={{ background: 'rgba(255,255,255,0.1)', height: '4px', width: '100%', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ background: '#38bdf8', height: '100%', width: warmingProgress + '%', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {successMessage && (
          <div style={{ marginTop: '10px', textAlign: 'center', color: '#1db954', fontWeight: '600' }}>
            {successMessage}
          </div>
        )}

        <div className="daily-prompt-actions">
          {selectedArtists.length >= 3 ? (
            <button className="skip-btn" onClick={handleSkip} disabled={loading}>
              Keep Yesterday's Artists
            </button>
          ) : (
            <div style={{ color: '#fbbf24', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              ⚠️ Select at least 3 artists
            </div>
          )}

          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={loading || selected.length < 3 || selected.length > 10}
          >
            {loading ? 'Pre-warming...' : `Confirm (${selected.length}/10)`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DailyArtistPrompt;
