import type { Router as RouterType } from "express";
import { Router } from "express";
import { getEpochInfo } from "../stream/epoch";

export const epochRouter: RouterType = Router();

epochRouter.get("/epoch", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getEpochInfo());
});
