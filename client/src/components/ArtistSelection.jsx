import React, { useState, useEffect } from 'react';
import { ARTISTS_DATA } from '../data/artists';
import './ArtistSelection.css';

const ArtistSelection = ({ onComplete, initialSelected = [] }) => {
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelected));
  const [searchTerm, setSearchTerm] = useState('');
  const [warning, setWarning] = useState('');
  const [prewarmedNames, setPrewarmedNames] = useState(null);

  const [isWindowActive, setIsWindowActive] = useState(false);
  const [hoursRemaining, setHoursRemaining] = useState(0);

  useEffect(() => {
    const PREWARM_TTL = 12 * 60 * 60 * 1000;
    const lastPrewarm = localStorage.getItem('lastDailyArtistPrompt');
    const active = lastPrewarm && (Date.now() - parseInt(lastPrewarm)) < PREWARM_TTL;
    
    if (active) {
      setIsWindowActive(true);
      const remainingMs = PREWARM_TTL - (Date.now() - parseInt(lastPrewarm));
      setHoursRemaining(Math.ceil(remainingMs / (60 * 60 * 1000)));
      const prewarmed = JSON.parse(localStorage.getItem('prewarmedArtists') || '[]');
      if (prewarmed.length > 0) {
        setPrewarmedNames(new Set(prewarmed));
      }
    }
  }, []);

  const toggleArtist = (id, artistName) => {
    if (isWindowActive && prewarmedNames && !prewarmedNames.has(artistName)) {
      return; // Prevent selecting non-prewarmed artists
    }
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (newSelected.size >= 3) setWarning('');
  };

  const handleContinue = () => {
    if (selectedIds.size < 3) {
      setWarning(`⚠️ We recommend at least 3 artists for the best experience. You have ${selectedIds.size}.`);
    }
    if (selectedIds.size > 0) {
      onComplete(Array.from(selectedIds));
    }
  };

  const filteredArtists = ARTISTS_DATA.filter((artist) =>
    artist.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = [...new Set(ARTISTS_DATA.map((a) => a.category))];

  return (
    <div className="artist-selection-overlay fade-in">
      <div className="artist-selection-container">
        <div className="artist-header">
          <h2>Select Your Favorite Artists</h2>
          <p>Pick at least 3 artists to personalize your experience. Currently selected: <strong>{selectedIds.size}</strong></p>
          {isWindowActive && (
            <div style={{ background: 'rgba(29, 185, 84, 0.1)', border: '1px solid #1db954', color: '#1db954', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem', textAlign: 'center' }}>
              Showing your artists for this session. New artists available in {hoursRemaining} hours.
            </div>
          )}
          <input
            type="text"
            className="artist-search"
            placeholder="Search artists..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="artist-categories">
          {categories.map(category => {
            const artistsInCategory = filteredArtists.filter(a => a.category === category);
            if (artistsInCategory.length === 0) return null;

            return (
              <div key={category} className="artist-category-section">
                <h3>{category}</h3>
                <div className="artist-grid">
                  {artistsInCategory.map((artist) => {
                    const isSelected = selectedIds.has(artist.id);
                    const isGreyedOut = isWindowActive && prewarmedNames && !prewarmedNames.has(artist.name);
                    return (
                      <div
                        key={artist.id}
                        className={`artist-card ${isSelected ? 'selected' : ''} ${isGreyedOut ? 'greyed-out' : ''}`}
                        onClick={() => toggleArtist(artist.id, artist.name)}
                        style={isGreyedOut ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                      >
                        <div className="artist-image-container">
                          <img src={artist.image} alt={artist.name} />
                          {isSelected && <div className="artist-checkmark">✓</div>}
                        </div>
                        <span className="artist-name">{artist.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="artist-footer">
          {warning && (
            <p style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '0.5rem', textAlign: 'center' }}>{warning}</p>
          )}
          <button
            className={`artist-continue-btn ${selectedIds.size > 0 ? 'active' : 'disabled'}`}
            onClick={handleContinue}
            disabled={selectedIds.size === 0}
          >
            {selectedIds.size >= 3 ? "Continue" : selectedIds.size > 0 ? `Continue with ${selectedIds.size}` : "Select at least 1"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtistSelection;
