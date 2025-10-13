import { Router, type Router as ExpressRouter } from "express";
import { db } from "../db";
import { callouts } from "../db/schema";
import { eq } from "drizzle-orm";

const router: ExpressRouter = Router();

router.post("/callouts/accept", async (req, res) => {
  try {
    const { calloutId } = req.body;

    await db.update(callouts).set({ accepted: true }).where(eq(callouts.id, calloutId));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to accept callout:", error);
    res.status(500).json({ error: "Failed to accept callout" });
  }
});

router.post("/callouts/reject", async (req, res) => {
  try {
    const { calloutId, reason } = req.body;

    await db
      .update(callouts)
      .set({ accepted: false, rejectedReason: reason })
      .where(eq(callouts.id, calloutId));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to reject callout:", error);
    res.status(500).json({ error: "Failed to reject callout" });
  }
});

export default router;
