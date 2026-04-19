import { createContext, useContext, useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ARTISTS_DATA } from "../data/artists";

const ArtistContext = createContext();

export const useArtists = () => useContext(ArtistContext);

export const ArtistProvider = ({ children }) => {
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [artistsLoaded, setArtistsLoaded] = useState(false);

  // Load artists from Firestore on mount (if user exists)
  useEffect(() => {
    const loadArtists = async () => {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists() && snap.data().selectedArtists && snap.data().selectedArtists.length > 0) {
            setSelectedArtists(snap.data().selectedArtists);
            localStorage.setItem("selectedArtists", JSON.stringify(snap.data().selectedArtists));
          } else {
            // Fallback to localStorage
            const local = localStorage.getItem("selectedArtists");
            if (local) setSelectedArtists(JSON.parse(local));
          }
        } catch (err) {
          console.error("Failed to load artists from Firestore:", err);
          const local = localStorage.getItem("selectedArtists");
          if (local) setSelectedArtists(JSON.parse(local));
        }
      } else {
        const local = localStorage.getItem("selectedArtists");
        if (local) setSelectedArtists(JSON.parse(local));
      }
      setArtistsLoaded(true);
    };

    loadArtists();
  }, []);

  // Persist to both Firestore + localStorage
  const updateArtists = async (newArtists) => {
    setSelectedArtists(newArtists);
    localStorage.setItem("selectedArtists", JSON.stringify(newArtists));

    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      try {
        await updateDoc(doc(db, "users", user.uid), {
          selectedArtists: newArtists,
        });
      } catch (err) {
        console.error("Failed to sync artists to Firestore:", err);
      }
    }
  };

  // Helper: resolve artist IDs to display names
  const getArtistNames = () => {
    return selectedArtists.map((id) => {
      const found = ARTISTS_DATA.find((a) => a.id === id);
      return found ? found.name : id;
    });
  };

  return (
    <ArtistContext.Provider
      value={{
        selectedArtists,
        setSelectedArtists: updateArtists,
        artistsLoaded,
        getArtistNames,
      }}
    >
      {children}
    </ArtistContext.Provider>
  );
};
