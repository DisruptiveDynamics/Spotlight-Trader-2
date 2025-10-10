import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  userId: string;
  email: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: true,
      setUser: (user) => set({ user, loading: false }),
      setLoading: (loading) => set({ loading }),
      logout: () => {
        set({ user: null });
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(console.error);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
