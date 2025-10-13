import React from "react";

/**
 * Splash screen with animated lightbulb mark
 * Pure CSS animation, respects prefers-reduced-motion
 */
export function Splash({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <div className="splash-overlay">
      <div className="splash-content">
        {/* Animated lightbulb mark */}
        <svg
          className="splash-logo"
          width="96"
          height="96"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className="bulb-mark">
            {/* Bulb outline with stroke animation */}
            <path
              className="bulb-path"
              d="M24 8C19.5817 8 16 11.5817 16 16C16 18.2091 16.8954 20.2091 18.3431 21.6569L18.5 21.8137V28C18.5 28.8284 19.1716 29.5 20 29.5H28C28.8284 29.5 29.5 28.8284 29.5 28V21.8137L29.6569 21.6569C31.1046 20.2091 32 18.2091 32 16C32 11.5817 28.4183 8 24 8Z"
              stroke="var(--brand-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Filament */}
            <path
              className="bulb-path"
              d="M22 18L24 20L26 18"
              stroke="var(--brand-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animationDelay: "0.3s" }}
            />
            {/* Base threads */}
            <line
              className="bulb-path"
              x1="20"
              y1="32"
              x2="28"
              y2="32"
              stroke="var(--brand-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ animationDelay: "0.5s" }}
            />
            <line
              className="bulb-path"
              x1="20"
              y1="35"
              x2="28"
              y2="35"
              stroke="var(--brand-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ animationDelay: "0.6s" }}
            />
            {/* Glow rays */}
            <path
              className="bulb-glow"
              d="M24 4V6M24 42V44M12 16H10M38 16H36M14.34 8.34L15.76 9.76M32.24 9.76L33.66 8.34M14.34 23.66L15.76 22.24M32.24 22.24L33.66 23.66"
              stroke="var(--brand-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.6"
            />
          </g>
        </svg>
      </div>

      <style>{`
        .splash-overlay {
          position: fixed;
          inset: 0;
          background-color: var(--bg-dark);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: splash-fade-out 250ms ease-out 1.5s forwards;
        }

        .splash-content {
          position: relative;
        }

        .splash-logo {
          filter: drop-shadow(0 0 24px var(--brand-primary-glow));
        }

        /* Stroke draw animation */
        .bulb-path {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
          animation: splash-draw 0.8s ease-out forwards;
        }

        /* Glow pulse animation */
        .bulb-glow {
          animation: splash-glow 1.5s ease-in-out infinite;
        }

        @keyframes splash-draw {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes splash-glow {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.8;
          }
        }

        @keyframes splash-fade-out {
          to {
            opacity: 0;
            pointer-events: none;
          }
        }

        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .splash-overlay {
            animation: none;
            opacity: 1;
          }
          
          .bulb-path {
            animation: none;
            stroke-dashoffset: 0;
          }
          
          .bulb-glow {
            animation: none;
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}
