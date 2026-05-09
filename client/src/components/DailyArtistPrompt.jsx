import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ARTISTS_DATA } from '../data/artists';
import './DailyArtistPrompt.css';

const DailyArtistPrompt = () => {
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check local storage for today's date
    const today = new Date().toLocaleDateString();
    const lastPromptDate = localStorage.getItem('lastDailyArtistPrompt');
    
    if (lastPromptDate !== today) {
      setShow(true);
    }
  }, []);

  const toggleArtist = (artistName) => {
    setSelected(prev => {
      if (prev.includes(artistName)) {
        return prev.filter(a => a !== artistName);
      } else {
        if (prev.length >= 10) return prev; // Max 10
        return [...prev, artistName];
      }
    });
  };

  const handleConfirm = async () => {
    if (selected.length === 0) {
      closePrompt();
      return;
    }

    setLoading(true);
    try {
      await axios.post('http://localhost:5000/api/prewarm-artists', {
        artists: selected
      });
      closePrompt();
    } catch (error) {
      console.error('Failed to prewarm artists:', error);
      closePrompt(); // Still close on error to avoid blocking UI
    } finally {
      setLoading(false);
    }
  };

  const closePrompt = () => {
    const today = new Date().toLocaleDateString();
    localStorage.setItem('lastDailyArtistPrompt', today);
    setShow(false);
  };

  if (!show) return null;

  // Top 24 artists to display in the prompt
  const topArtists = ARTISTS_DATA.slice(0, 24);

  return (
    <div className="daily-prompt-overlay">
      <div className="daily-prompt-modal">
        <h2>What are you listening to today?</h2>
        <p>Pick up to 10 artists to pre-load for Solo Mode.</p>
        
        <div className="daily-prompt-grid">
          {topArtists.map(artist => (
            <div 
              key={artist.id}
              className={`daily-prompt-card ${selected.includes(artist.name) ? 'selected' : ''}`}
              onClick={() => toggleArtist(artist.name)}
            >
              <img src={artist.image} alt={artist.name} />
              <span>{artist.name}</span>
            </div>
          ))}
        </div>
        
        <div className="daily-prompt-actions">
          <button className="skip-btn" onClick={closePrompt} disabled={loading}>
            Skip
          </button>
          <button 
            className="confirm-btn" 
            onClick={handleConfirm} 
            disabled={loading || selected.length === 0}
          >
            {loading ? 'Pre-warming...' : `Confirm (${selected.length}/10)`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DailyArtistPrompt;
