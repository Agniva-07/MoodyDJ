import { useState } from "react";

function Navbar({ moods, activeMood, onMoodSelect }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="navbar">
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle mood menu"
      >
        <span />
        <span />
        <span />
      </button>

      {open ? (
        <div className="mood-dropdown fade-in">
          {moods.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className={`dropdown-item ${activeMood === mood.id ? "active" : ""}`}
              onClick={() => {
                onMoodSelect(mood.id);
                setOpen(false);
              }}
            >
              <span>{mood.icon}</span>
              {mood.title}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export default Navbar;
