import { create } from 'zustand';
import { authStorage } from '../auth/authStorage';

interface User {
  userId: string;
  email: string;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const stored = authStorage.get();
  const isValid = stored && stored.user && !authStorage.isExpired();
  
  return {
    user: (isValid && stored?.user) ? stored.user : null,
    
    setUser: (user) => {
      set({ user });
      if (user) {
        authStorage.set({
          user,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
      } else {
        authStorage.clear();
      }
    },
    
    logout: () => {
      authStorage.clear();
      set({ user: null });
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(console.error);
    },
  };
});
