import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || err?.statusCode || 500;
  const code = err?.code || "INTERNAL_ERROR";
  const message = err?.message || "Unexpected server error";

  console.error("[API Error]", {
    status,
    code,
    message,
    path: req.path,
    method: req.method,
    stack: err?.stack,
    timestamp: new Date().toISOString(),
  });

  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
    },
  });
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
}
