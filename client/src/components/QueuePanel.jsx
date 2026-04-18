function QueuePanel({ songs, currentIndex, onSelect, recentSongs = [] }) {
  return (
    <aside className="queue-panel fade-in">
      <div className="queue-head">
        <h3>🎵 Queue</h3>
        <p>Next up in your session</p>
      </div>

      <div className="queue-list">
        {songs.length === 0 ? (
          <div className="queue-song empty">No songs in queue</div>
        ) : (
          songs.map((song, index) => (
            <button
              key={song.videoId}
              type="button"
              className={`queue-song ${index === currentIndex ? "active" : ""}`}
              onClick={() => onSelect(index)}
              aria-label={`Play: ${song.title}`}
            >
              <span className="queue-index">{index === currentIndex ? "▶" : String(index + 1).padStart(2, "0")}</span>
              <div className="queue-copy">
                <strong>{song.title}</strong>
                <p>{song.channelTitle || "YouTube"}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="recent-section">
        <h4>Recently Played</h4>
        <div className="recent-list">
          {recentSongs.length === 0 ? (
            <p>No recent tracks yet.</p>
          ) : (
            recentSongs.slice(0, 6).map((song) => (
              <div key={`recent-${song.videoId}`} className="recent-item">
                <strong>{song.title || "Untitled track"}</strong>
                <span>{song.channelTitle || "YouTube"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

export default QueuePanel;
