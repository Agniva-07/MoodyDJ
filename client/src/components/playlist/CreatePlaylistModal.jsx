import React, { useState, useEffect } from 'react';
import { usePlaylist } from '../../context/PlaylistContext';
import { playlistService } from '../../services/playlistService';
import './Playlist.css';

const CreatePlaylistModal = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createPlaylist } = usePlaylist();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const newPlaylist = await createPlaylist(name.trim(), description.trim());
    setIsSubmitting(false);
    
    if (newPlaylist) {
      if (onCreated) onCreated(newPlaylist);
      onClose();
    }
  };

  const previewGradient = name.trim() ? playlistService.generateGradient(name.trim()) : 'rgba(255,255,255,0.1)';

  return (
    <div className="playlist-modal-overlay" onClick={onClose}>
      <div className="playlist-modal" onClick={e => e.stopPropagation()}>
        <h2>Create Playlist</h2>
        
        <div className="playlist-gradient-preview" style={{ background: previewGradient }}></div>
        
        <form onSubmit={handleSubmit}>
          <div>
            <input
              type="text"
              placeholder="Playlist Name"
              className="playlist-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>
          <div>
            <textarea
              placeholder="Description (optional)"
              className="playlist-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              onClick={onClose}
              className="playlist-action-btn"
              style={{ background: 'transparent' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="create-playlist-btn"
              disabled={!name.trim() || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePlaylistModal;
