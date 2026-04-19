import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const ProtectedRoute = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Rely exclusively on true Firebase states avoiding transient variables completely
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="landing-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="bg-overlay" />
        <div className="animated-gradient" />
        <div style={{ zIndex: 10, textAlign: 'center' }}>
          <h2 style={{ color: '#e0f2fe', marginBottom: '1rem', animation: 'pulse 1.5s infinite', fontSize: '2rem' }}>Verifying Session...</h2>
          <div className="loading-indicator" style={{ display: "inline-block", fontSize: "1.2rem", marginTop: "1rem" }}>Please wait</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
