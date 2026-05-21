import React, { useEffect, useState } from 'react';
import { usePlaylist } from '../../context/PlaylistContext';
import CreatePlaylistModal from './CreatePlaylistModal';
import './Playlist.css';

const AddToPlaylistModal = ({ isOpen, onClose, song }) => {
  const { 
    playlists, 
    playlistsLoaded, 
    fetchPlaylists, 
    addSongToPlaylist,
    cacheSongMetadata 
  } = usePlaylist();
  
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (isOpen && !playlistsLoaded) {
      fetchPlaylists();
    }
  }, [isOpen, playlistsLoaded, fetchPlaylists]);

  useEffect(() => {
    if (isOpen && song) {
      cacheSongMetadata(song);
    }
  }, [isOpen, song, cacheSongMetadata]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !showCreateModal) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showCreateModal]);

  if (!isOpen || !song) return null;

  const handleAdd = async (playlistId) => {
    await addSongToPlaylist(playlistId, song);
    // Modal stays open intentionally so user can add to multiple playlists
  };

  return (
    <>
      <div className="playlist-modal-overlay" onClick={onClose}>
        <div className="playlist-modal" onClick={e => e.stopPropagation()}>
          <h2>Add to Playlist</h2>
          
          <button 
            className="create-playlist-btn" 
            style={{ width: '100%', marginBottom: '1rem' }}
            onClick={() => setShowCreateModal(true)}
          >
            + Create New Playlist
          </button>

          {!playlistsLoaded ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
              Loading playlists...
            </div>
          ) : playlists.length === 0 ? (
            <div className="playlist-empty" style={{ padding: '1rem' }}>
              You don't have any playlists yet.
            </div>
          ) : (
            <div className="playlist-select-list">
              {playlists.map(playlist => {
                const isAdded = playlist.songIds && playlist.songIds.includes(song.videoId);
                
                return (
                  <div 
                    key={playlist.id}
                    className={`playlist-select-item ${isAdded ? 'already-added' : ''}`}
                    onClick={() => !isAdded && handleAdd(playlist.id)}
                  >
                    <div 
                      className="playlist-select-item-cover"
                      style={{ background: playlist.coverGradient || '#7c3aed' }}
                    />
                    <div className="playlist-select-item-info">
                      <h4>{playlist.name}</h4>
                      <p>{playlist.songCount || 0} songs</p>
                    </div>
                    {isAdded && <div style={{ color: '#1db954', fontWeight: 'bold' }}>✓</div>}
                  </div>
                );
              })}
            </div>
          )}
          
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button 
              className="playlist-action-btn"
              onClick={onClose}
              style={{ background: 'transparent' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <CreatePlaylistModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newPlaylist) => {
          setShowCreateModal(false);
          handleAdd(newPlaylist.id);
        }}
      />
    </>
  );
};

export default AddToPlaylistModal;
