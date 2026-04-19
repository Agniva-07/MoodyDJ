import { auth } from "../firebase";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { syncUserToFirestore } from "./userService";

// ✅ CRITICAL FIX: Ensure persistence
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    await syncUserToFirestore(result.user);
    return result.user;
  } catch (error) {
    console.error("Google Login Error:", error);
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error("Sign-in popup was closed before finishing.");
    }
    throw new Error("Failed to sign in with Google. Please try again.");
  }
};

export const loginWithEmail = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Email Login Error:", error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error("Invalid email or password.");
    } else if (error.code === 'auth/invalid-email') {
      throw new Error("Invalid email address format.");
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error("Too many unsuccessful login attempts. Try again later.");
    }
    throw new Error("Failed to login. Please try again.");
  }
};

export const signupWithEmail = async (name, email, password) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    await syncUserToFirestore(result.user);
    return result.user;
  } catch (error) {
    console.error("Signup Error:", error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error("This email is already registered. Please log in.");
    } else if (error.code === 'auth/invalid-email') {
      throw new Error("Invalid email address format.");
    } else if (error.code === 'auth/weak-password') {
      throw new Error("Password must be at least 6 characters.");
    } else if (error.code === 'auth/operation-not-allowed') {
      throw new Error("Email/Password accounts are not enabled.");
    }
    throw new Error("Failed to create an account. Please try again.");
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("user"); 
    localStorage.removeItem("likedSongs");
    localStorage.removeItem("selectedArtists");
    localStorage.removeItem("isPersonalized");
  } catch (error) {
    console.error("Logout Error:", error);
  }
};
