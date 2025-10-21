import { eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";

import { db } from "../db/index.js";
import { userPreferences } from "../db/schema.js";
import { requirePin } from "../middleware/requirePin";

interface UserPreferences {
  favoriteSymbols?: string[];
  defaultTimeframe?: string;
  chartTheme?: string;
  focusMode?: string;
  signalDensity?: string;
  signalAudio?: boolean;
  colorVision?: string;
  highContrast?: boolean;
  sessionPolicy?: "auto" | "rth" | "rth_ext";
  notifications?: {
    voice?: boolean;
    visual?: boolean;
    sound?: boolean;
  };
}

export function setupPreferencesRoutes(app: Express) {
  // GET /api/nexa/preferences - Get user preferences
  app.get("/api/nexa/preferences", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || "owner";

      const prefs = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      if (prefs.length === 0) {
        // Return defaults if no preferences exist
        return res.json({
          favoriteSymbols: ["SPY", "QQQ", "NVDA"],
          defaultTimeframe: "1m",
          chartTheme: "dark",
          focusMode: "normal",
          signalDensity: "medium",
          signalAudio: true,
          colorVision: "normal",
          highContrast: false,
          sessionPolicy: "auto",
          notifications: {
            voice: true,
            visual: true,
            sound: true,
          },
        });
      }

      const pref = prefs[0]!;
      res.json({
        favoriteSymbols: pref.favoriteSymbols,
        defaultTimeframe: pref.defaultTimeframe,
        chartTheme: pref.chartTheme,
        focusMode: pref.focusMode,
        signalDensity: pref.signalDensity,
        signalAudio: pref.signalAudio,
        colorVision: pref.colorVision,
        highContrast: pref.highContrast,
        sessionPolicy: pref.sessionPolicy || "auto",
        notifications: pref.notifications as { voice: boolean; visual: boolean; sound: boolean },
      });
    } catch (error) {
      console.error("Get preferences error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // PUT /api/nexa/preferences - Update all preferences (for migration)
  app.put("/api/nexa/preferences", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || "owner";
      const updates: UserPreferences = req.body;

      // Check if preferences exist
      const existing = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      const data = {
        userId,
        favoriteSymbols: updates.favoriteSymbols ?? ["SPY", "QQQ", "NVDA"],
        defaultTimeframe: updates.defaultTimeframe ?? "1m",
        chartTheme: updates.chartTheme ?? "dark",
        focusMode: updates.focusMode ?? "normal",
        signalDensity: updates.signalDensity ?? "medium",
        signalAudio: updates.signalAudio ?? true,
        colorVision: updates.colorVision ?? "normal",
        highContrast: updates.highContrast ?? false,
        sessionPolicy: updates.sessionPolicy ?? "auto",
        notifications: updates.notifications ?? {
          voice: true,
          visual: true,
          sound: true,
        },
        updatedAt: new Date(),
      };

      if (existing.length === 0) {
        // Insert new preferences
        await db.insert(userPreferences).values(data);
      } else {
        // Update existing preferences
        await db.update(userPreferences).set(data).where(eq(userPreferences.userId, userId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // PATCH /api/nexa/preferences - Partial update with deep merge
  app.patch("/api/nexa/preferences", requirePin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || "owner";
      const updates: Partial<UserPreferences> = req.body;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      // Load existing preferences or defaults
      const existing = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      const current =
        existing.length > 0
          ? existing[0]!
          : {
              userId,
              favoriteSymbols: ["SPY", "QQQ", "NVDA"],
              defaultTimeframe: "1m",
              chartTheme: "dark",
              focusMode: "normal",
              signalDensity: "medium",
              signalAudio: true,
              colorVision: "normal",
              highContrast: false,
              sessionPolicy: "auto",
              notifications: {
                voice: true,
                visual: true,
                sound: true,
              },
              updatedAt: new Date(),
            };

      // Deep merge notifications to prevent data loss
      const mergedNotifications = updates.notifications
        ? {
            ...((current.notifications as { voice: boolean; visual: boolean; sound: boolean }) || {
              voice: true,
              visual: true,
              sound: true,
            }),
            ...updates.notifications,
          }
        : current.notifications;

      const mergedData = {
        userId,
        favoriteSymbols: updates.favoriteSymbols ?? current.favoriteSymbols,
        defaultTimeframe: updates.defaultTimeframe ?? current.defaultTimeframe,
        chartTheme: updates.chartTheme ?? current.chartTheme,
        focusMode: updates.focusMode ?? current.focusMode,
        signalDensity: updates.signalDensity ?? current.signalDensity,
        signalAudio: updates.signalAudio ?? current.signalAudio,
        colorVision: updates.colorVision ?? current.colorVision,
        highContrast: updates.highContrast ?? current.highContrast,
        sessionPolicy: updates.sessionPolicy ?? current.sessionPolicy ?? "auto",
        notifications: mergedNotifications,
        updatedAt: new Date(),
      };

      if (existing.length === 0) {
        // Insert new record with merged data
        await db.insert(userPreferences).values(mergedData);
      } else {
        // Update existing with merged data
        await db.update(userPreferences).set(mergedData).where(eq(userPreferences.userId, userId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Patch preferences error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });
}
