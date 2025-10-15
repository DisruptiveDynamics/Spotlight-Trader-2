import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

import { authStorage } from "../auth/authStorage";

// Preserve store across HMR
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log("[HMR] authStore reloaded");
  });
}

export type User = {
  id: string;
  email: string;
  name?: string;
  demo?: boolean;
} | null;

type AuthState = {
  user: User;
  authReady: boolean; // hydration + logic guard
  setUser: (u: User) => void;
  logout: () => void;
  markReady: () => void;
};

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        user: null,
        authReady: false,
        setUser: (u) => {
          console.log("[authStore] setUser:", u);
          set({ user: u });
          // Keep legacy authStorage in sync for now
          if (u) {
            authStorage.set({
              user: { userId: u.id, email: u.email, createdAt: new Date().toISOString() },
              expiresAt: Date.now() + 30 * 60 * 1000,
            });
          } else {
            authStorage.clear();
          }
        },
        logout: () => {
          authStorage.clear();
          set({ user: null, authReady: false });
          fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
          }).catch(console.error);
        },
        markReady: () => {
          console.log("[authStore] Marking auth as ready");
          set({ authReady: true });
        },
      }),
      { name: "spotlight-auth" },
    ),
  ),
);
