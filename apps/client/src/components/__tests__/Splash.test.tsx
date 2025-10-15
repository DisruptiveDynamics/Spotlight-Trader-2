import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Splash } from "../Splash";

describe("Splash", () => {
  it("renders when isVisible is true", () => {
    const { container } = render(<Splash isVisible={true} />);
    const overlay = container.querySelector(".splash-overlay");
    expect(overlay).not.toBeNull();
  });

  it("does not render when isVisible is false", () => {
    const { container } = render(<Splash isVisible={false} />);
    const overlay = container.querySelector(".splash-overlay");
    expect(overlay).toBeNull();
  });

  it("renders lightbulb logo SVG", () => {
    const { container } = render(<Splash isVisible={true} />);
    const svg = container.querySelector(".splash-logo");
    expect(svg).not.toBeNull();
  });

  it("includes CSS animation styles", () => {
    const { container } = render(<Splash isVisible={true} />);
    const style = container.querySelector("style");
    expect(style?.textContent).toContain("splash-draw");
    expect(style?.textContent).toContain("splash-glow");
    expect(style?.textContent).toContain("splash-fade-out");
  });

  it("respects prefers-reduced-motion", () => {
    const { container } = render(<Splash isVisible={true} />);
    const style = container.querySelector("style");
    expect(style?.textContent).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
