import React, { useState } from 'react';
import { ARTISTS_DATA } from '../data/artists';
import './ArtistSelection.css';

const ArtistSelection = ({ onComplete, initialSelected = [] }) => {
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelected));
  const [searchTerm, setSearchTerm] = useState('');
  const [warning, setWarning] = useState('');

  const toggleArtist = (id) => {
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
      setWarning(`⚠️ Select at least 3 artists. Currently selected: ${selectedIds.size}`);
      return;
    }
    onComplete(Array.from(selectedIds));
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
                    return (
                      <div
                        key={artist.id}
                        className={`artist-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleArtist(artist.id)}
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
            className={`artist-continue-btn ${selectedIds.size >= 3 ? 'active' : 'disabled'}`}
            onClick={handleContinue}
            disabled={selectedIds.size < 3}
          >
            {selectedIds.size >= 3 ? "Continue" : `Select at least ${3 - selectedIds.size} more`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtistSelection;
