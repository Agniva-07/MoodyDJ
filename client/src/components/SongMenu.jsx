import React, { useState, useEffect, useRef } from "react";

function SongMenu({ 
  song, 
  onAddToQueue, 
  onAddToPlaylist, 
  onRemove, 
  onPlay,
  removeLabel = "Remove" 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!menuRef.current) return;
    const parent = menuRef.current.closest(".queue-song, .recent-item, .playlist-song-item, .liked-song-card");
    if (parent) {
      if (isOpen) {
        parent.classList.add("menu-open");
      } else {
        parent.classList.remove("menu-open");
      }
    }
    return () => {
      if (parent) {
        parent.classList.remove("menu-open");
      }
    };
  }, [isOpen]);

  const handleAction = (e, callback) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    if (callback) {
      callback(song);
    }
  };

  return (
    <div className="song-menu-container" ref={menuRef}>
      <button 
        className="song-menu-trigger" 
        onClick={toggleMenu}
        aria-label="Song actions"
        title="More actions"
      >
        ⋮
      </button>

      {isOpen && (
        <div className="song-menu-dropdown">
          {onPlay && (
            <button 
              className="song-menu-item" 
              onClick={(e) => handleAction(e, onPlay)}
            >
              <span className="song-menu-icon">▶</span> Play Now
            </button>
          )}
          {onAddToQueue && (
            <button 
              className="song-menu-item" 
              onClick={(e) => handleAction(e, onAddToQueue)}
            >
              <span className="song-menu-icon">➕</span> Add to Queue
            </button>
          )}
          {onAddToPlaylist && (
            <button 
              className="song-menu-item" 
              onClick={(e) => handleAction(e, onAddToPlaylist)}
            >
              <span className="song-menu-icon">📂</span> Add to Playlist
            </button>
          )}
          {onRemove && (
            <button 
              className="song-menu-item remove" 
              onClick={(e) => handleAction(e, onRemove)}
            >
              <span className="song-menu-icon">✕</span> {removeLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SongMenu;
