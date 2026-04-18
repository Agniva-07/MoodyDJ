function Queue({ songs, currentIndex, onSelect }) {
  return (
    <aside className="queue-panel glass fade-in">
      <h3>Queue</h3>
      <p className="queue-caption">Up next</p>

      <div className="queue-list">
        {songs.length === 0 ? (
          <div className="queue-song empty">No songs loaded</div>
        ) : (
          songs.map((song, index) => (
            <button
              key={song.videoId}
              type="button"
              className={`queue-song ${index === currentIndex ? "active" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span>{index === currentIndex ? "▶" : index + 1}</span>
              <div>
                <strong>{song.title}</strong>
                <p>{song.channelTitle || "YouTube"}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

export default Queue;
