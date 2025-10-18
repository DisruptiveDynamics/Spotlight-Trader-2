import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

import { authStorage } from "../auth/authStorage";

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
  authReady: boolean;
  setUser: (u: User) => void;
  logout: () => void;
  verifyAuth: () => Promise<void>;
  markReady: () => void;
};

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set, _get) => ({
        user: null,
        authReady: false,
        setUser: (u) => {
          console.log("[authStore] setUser:", u);
          set({ user: u });
          if (u) {
            authStorage.set({
              user: { userId: u.id, email: u.email, createdAt: new Date().toISOString() },
              expiresAt: Date.now() + 30 * 60 * 1000,
            });
          } else {
            authStorage.clear();
          }
        },
        logout: async () => {
          console.log("[authStore] Logging out");
          authStorage.clear();
          set({ user: null, authReady: true });
          try {
            await fetch("/api/pin/logout", {
              method: "POST",
              credentials: "include",
            });
          } catch (err) {
            console.error("[authStore] Logout failed:", err);
          }
        },
        verifyAuth: async () => {
          console.log("[authStore] Verifying server auth status");
          try {
            const res = await fetch("/api/pin/status", {
              credentials: "include",
            });
            
            if (res.ok) {
              const data = await res.json();
              if (data.ok && data.user) {
                console.log("[authStore] Server auth valid, user:", data.user.id);
                set({ user: { id: data.user.id, email: data.user.email }, authReady: true });
                return;
              }
            }
            
            console.log("[authStore] Server auth invalid, clearing persisted state");
            authStorage.clear();
            set({ user: null, authReady: true });
          } catch (err) {
            console.error("[authStore] Auth verification failed:", err);
            authStorage.clear();
            set({ user: null, authReady: true });
          }
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
