import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ARTISTS_DATA } from "../data/artists";

const ArtistContext = createContext();

export const useArtists = () => useContext(ArtistContext);

export const ArtistProvider = ({ children }) => {
  const [selectedArtists, setSelectedArtistsRaw] = useState([]);
  const [artistsLoaded, setArtistsLoaded] = useState(false);
  const [onboardingCompletedToday, setOnboardingCompletedToday] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [currentUid, setCurrentUid] = useState(null);

  // Listen for auth state to load artists from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSelectedArtistsRaw([]);
        setOnboardingCompletedToday(false);
        setOnboardingChecked(true);
        setArtistsLoaded(true);
        setCurrentUid(null);
        return;
      }

      setCurrentUid(user.uid);

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();

          // Load selected artists
          if (data.selectedArtists && data.selectedArtists.length > 0) {
            setSelectedArtistsRaw(data.selectedArtists);
            localStorage.setItem("selectedArtists", JSON.stringify(data.selectedArtists));
          } else {
            const local = localStorage.getItem("selectedArtists");
            if (local) setSelectedArtistsRaw(JSON.parse(local));
          }

          // Check onboarding date
          const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
          if (data.lastOnboardedDate === today) {
            setOnboardingCompletedToday(true);
          } else {
            setOnboardingCompletedToday(false);
          }
        } else {
          const local = localStorage.getItem("selectedArtists");
          if (local) setSelectedArtistsRaw(JSON.parse(local));
          setOnboardingCompletedToday(false);
        }
      } catch (err) {
        console.error("Failed to load artists from Firestore:", err);
        const local = localStorage.getItem("selectedArtists");
        if (local) setSelectedArtistsRaw(JSON.parse(local));
        setOnboardingCompletedToday(false);
      }

      setOnboardingChecked(true);
      setArtistsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // Persist to both Firestore + localStorage — SINGLE write path
  const updateArtists = useCallback(async (newArtists) => {
    setSelectedArtistsRaw(newArtists);
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
  }, []);

  // Mark onboarding as completed today — writes to Firestore
  const completeOnboarding = useCallback(async (artistIds) => {
    setSelectedArtistsRaw(artistIds);
    localStorage.setItem("selectedArtists", JSON.stringify(artistIds));

    const today = new Date().toLocaleDateString("en-CA");

    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      try {
        await updateDoc(doc(db, "users", user.uid), {
          selectedArtists: artistIds,
          lastOnboardedDate: today,
        });
      } catch (err) {
        console.error("Failed to save onboarding to Firestore:", err);
      }
    }

    setOnboardingCompletedToday(true);
    localStorage.setItem("lastDailyArtistPrompt", Date.now().toString());
  }, []);

  // Helper: resolve artist IDs to display names
  const getArtistNames = useCallback(() => {
    return selectedArtists.map((id) => {
      const found = ARTISTS_DATA.find((a) => a.id === id);
      return found ? found.name : id;
    });
  }, [selectedArtists]);

  return (
    <ArtistContext.Provider
      value={{
        selectedArtists,
        setSelectedArtists: updateArtists,
        artistsLoaded,
        getArtistNames,
        onboardingCompletedToday,
        onboardingChecked,
        completeOnboarding,
        currentUid,
      }}
    >
      {children}
    </ArtistContext.Provider>
  );
};
