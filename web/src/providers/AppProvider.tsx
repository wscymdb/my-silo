import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface AppContextValue {
  token: string;
  setToken: (token: string) => void;
  showToast: (message: string) => void;
}
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [token, updateToken] = useState(() => localStorage.getItem('silo_token') || '');
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const setToken = useCallback((value: string) => {
    if (value) localStorage.setItem('silo_token', value);
    else localStorage.removeItem('silo_token');
    updateToken(value);
  }, []);
  const showToast = useCallback((value: string) => {
    clearTimeout(timer.current);
    setMessage(value);
    timer.current = setTimeout(() => setMessage(''), 2500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <AppContext.Provider value={{ token, setToken, showToast }}>
      {children}
      {message && (
        <div role="status" className="fixed top-6 right-6 z-50 max-w-[calc(100vw-3rem)] rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-950 shadow-lg flex items-center gap-2 animate-in fade-in-0 slide-in-from-top-2">
          <Check className="w-3.5 h-3.5 text-zinc-900" />
          <span>{message}</span>
        </div>
      )}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp requires AppProvider');
  return value;
}
