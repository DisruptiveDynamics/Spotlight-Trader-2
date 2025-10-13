const KEY = "spotlight_auth_v1";

export interface AuthSnapshot {
  user?: {
    userId: string;
    email: string;
    createdAt?: string;
  };
  expiresAt?: number;
}

export const authStorage = {
  get(): AuthSnapshot | null {
    try {
      const stored = localStorage.getItem(KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  set(snapshot: AuthSnapshot): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error("Failed to save auth state:", error);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch (error) {
      console.error("Failed to clear auth state:", error);
    }
  },

  isExpired(): boolean {
    const snapshot = this.get();
    if (!snapshot?.expiresAt) return true;
    return Date.now() > snapshot.expiresAt;
  },
};
