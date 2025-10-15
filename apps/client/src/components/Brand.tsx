import React from "react";

/**
 * Spot Light Trader brand logo and wordmark
 * Displays lightbulb mark with text, links to home
 */
export function Brand() {
  return (
    <a
      href="/"
      className="brand flex items-center gap-3 group transition-opacity hover:opacity-90"
      aria-label="Spot Light Trader - Home"
    >
      {/* Logo Mark */}
      <div className="relative">
        <img
          src="/brand/logo-mark.svg"
          alt="Spot Light Trader logo"
          className="w-8 h-8 transition-all duration-200"
          style={{
            filter: "drop-shadow(0 0 8px var(--brand-primary-glow))",
          }}
        />
        {/* Subtle glow on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{
            background: "radial-gradient(circle, var(--brand-primary-glow) 0%, transparent 70%)",
            transform: "scale(1.5)",
          }}
        />
      </div>

      {/* Wordmark */}
      <div className="flex flex-col leading-tight">
        <span
          className="text-base font-bold tracking-wide"
          style={{ color: "var(--brand-primary)" }}
        >
          SPOT LIGHT
        </span>
        <span
          className="text-[10px] font-medium tracking-widest opacity-80"
          style={{ color: "var(--brand-primary)" }}
        >
          TRADER
        </span>
      </div>
    </a>
  );
}
