import { toZonedTime } from "date-fns-tz";

const ET = "America/New_York";

export type SessionType = "RTH" | "RTH_EXT";
export type SessionPolicy = "auto" | "rth" | "rth_ext";

export interface SessionPolicyManager {
  getCurrentSession(timestamp?: number): SessionType;
  getUserSession(userPolicy: SessionPolicy, timestamp?: number): SessionType;
  isMarketOpen(timestamp?: number): boolean;
  getNextTransitionTime(timestamp?: number): { time: Date; toSession: SessionType } | null;
}

export function createSessionPolicyManager(): SessionPolicyManager {
  function getCurrentSession(timestamp: number = Date.now()): SessionType {
    const etDate = toZonedTime(new Date(timestamp), ET);
    const hour = etDate.getHours();
    const minute = etDate.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    const preMarketStart = 4 * 60;
    const marketOpen = 9 * 60 + 30;
    const marketClose = 16 * 60;
    const afterHoursEnd = 20 * 60;

    if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
      return "RTH";
    }

    return "RTH_EXT";
  }

  function getUserSession(userPolicy: SessionPolicy, timestamp: number = Date.now()): SessionType {
    if (userPolicy === "rth") {
      return "RTH";
    }
    if (userPolicy === "rth_ext") {
      return "RTH_EXT";
    }

    return getCurrentSession(timestamp);
  }

  function isMarketOpen(timestamp: number = Date.now()): boolean {
    const etDate = toZonedTime(new Date(timestamp), ET);
    const dayOfWeek = etDate.getDay();
    const hour = etDate.getHours();
    const minute = etDate.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) {
      return false;
    }

    const preMarketStart = 4 * 60;
    const afterHoursEnd = 20 * 60;

    return timeInMinutes >= preMarketStart && timeInMinutes < afterHoursEnd;
  }

  function getNextTransitionTime(
    timestamp: number = Date.now(),
  ): { time: Date; toSession: SessionType } | null {
    const etDate = toZonedTime(new Date(timestamp), ET);
    const hour = etDate.getHours();
    const minute = etDate.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    const currentSession = getCurrentSession(timestamp);

    const marketOpen = 9 * 60 + 30;
    const marketClose = 16 * 60;

    const today = new Date(etDate);
    today.setHours(0, 0, 0, 0);

    if (currentSession === "RTH_EXT" && timeInMinutes < marketOpen) {
      const nextTransition = new Date(today);
      nextTransition.setHours(9, 30, 0, 0);
      return { time: nextTransition, toSession: "RTH" };
    }

    if (currentSession === "RTH") {
      const nextTransition = new Date(today);
      nextTransition.setHours(16, 0, 0, 0);
      return { time: nextTransition, toSession: "RTH_EXT" };
    }

    if (currentSession === "RTH_EXT" && timeInMinutes >= marketClose) {
      const nextTransition = new Date(today);
      nextTransition.setDate(today.getDate() + 1);
      nextTransition.setHours(9, 30, 0, 0);
      return { time: nextTransition, toSession: "RTH" };
    }

    return null;
  }

  return {
    getCurrentSession,
    getUserSession,
    isMarketOpen,
    getNextTransitionTime,
  };
}

export const sessionPolicy = createSessionPolicyManager();
