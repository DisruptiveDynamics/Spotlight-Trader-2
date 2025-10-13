import { create } from "zustand";
import { authStorage } from "../auth/authStorage";

// Preserve store across HMR
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log("[HMR] authStore reloaded");
  });
}

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

const getInitialUser = (): User | null => {
  const stored = authStorage.get();
  const isValid = stored && stored.user && !authStorage.isExpired();
  return isValid && stored?.user ? stored.user : null;
};

// Export store as singleton
export const useAuthStore = create<AuthState>((set) => ({
  user: getInitialUser(),

  setUser: (user) => {
    console.log("[authStore] setUser called with:", user);
    set({ user });
    if (user) {
      const authData = {
        user,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      console.log("[authStore] Saving to localStorage:", authData);
      authStorage.set(authData);
    } else {
      console.log("[authStore] Clearing localStorage");
      authStorage.clear();
    }
  },

  logout: () => {
    authStorage.clear();
    set({ user: null });
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(console.error);
  },
}));
