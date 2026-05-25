import React, { useState } from 'react';
import axios from 'axios';
import { ARTISTS_DATA } from '../data/artists';
import { updateCachedPool } from '../services/cacheService';
import { saveSongsToPool } from '../services/dbService';
import './ArtistSelection.css';
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const ArtistSelection = ({ onComplete, initialSelected = [], prewarmedIds = [] }) => {
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelected));
  const [searchTerm, setSearchTerm] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [warmingProgress, setWarmingProgress] = useState(0);

  const isArtistDisabled = (id) => {
    return prewarmedIds.length > 0 && !prewarmedIds.includes(id);
  };

  const toggleArtist = (id) => {
    if (isArtistDisabled(id)) return; // Don't allow toggling disabled artists

    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (newSelected.size >= 3) setWarning('');
  };

  const handleContinue = async () => {
    if (selectedIds.size < 3) {
      setWarning(`⚠️ Select at least 3 artists. Currently selected: ${selectedIds.size}`);
      return;
    }

    setLoading(true);
    setWarmingProgress(0);

    const progressInterval = setInterval(() => {
      setWarmingProgress(prev => Math.min(prev + (100 / selectedIds.size), 99));
    }, 600);

    try {
      const artistNames = Array.from(selectedIds).map(id => {
        const found = ARTISTS_DATA.find(a => a.id === id);
        return found ? found.name : id;
      });

      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://${API_BASE}'}/api/prewarm-artists`, {
        artists: artistNames
      });

      if (response.data && response.data.songs) {
        await saveSongsToPool(response.data.songs);
        updateCachedPool(response.data.songs);
      }
    } catch (apiErr) {
      console.warn("⚠️ Prewarm API request failed during onboarding.", apiErr);
    } finally {
      clearInterval(progressInterval);
      setWarmingProgress(100);
      setLoading(false);
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
                    const isDisabled = isArtistDisabled(artist.id);
                    return (
                      <div
                        key={artist.id}
                        className={`artist-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                        onClick={() => toggleArtist(artist.id)}
                        title={isDisabled ? 'Not available today — select during morning setup.' : ''}
                      >
                        <div className="artist-image-container">
                          <img src={artist.image} alt={artist.name} />
                          {isSelected && <div className="artist-checkmark">✓</div>}
                          {isDisabled && <div className="artist-lock-icon">🔒</div>}
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

        {loading && warmingProgress > 0 && (
          <div className="prewarm-progress-container" style={{ textAlign: 'center', marginBottom: '15px' }}>
            <p style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '8px' }}>
              Building your music profile...
            </p>
            <div style={{ background: 'rgba(255,255,255,0.1)', height: '4px', width: '100%', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ background: '#38bdf8', height: '100%', width: warmingProgress + '%', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        <div className="artist-footer">
          {warning && (
            <p style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '0.5rem', textAlign: 'center' }}>{warning}</p>
          )}
          <button
            className={`artist-continue-btn ${selectedIds.size >= 3 ? 'active' : 'disabled'}`}
            onClick={handleContinue}
            disabled={selectedIds.size < 3 || loading}
          >
            {loading ? 'Pre-warming...' : (selectedIds.size >= 3 ? "Continue" : `Select at least ${3 - selectedIds.size} more`)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtistSelection;
