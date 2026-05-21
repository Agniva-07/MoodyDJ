import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  const showToast = useCallback((message, type = 'info') => {
    const id = toastIdCounter.current++;
    
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 3000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => 
      prev.map(toast => 
        toast.id === id ? { ...toast, exiting: true } : toast
      )
    );

    // Remove from state after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 300); // 300ms matches exit animation duration
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
