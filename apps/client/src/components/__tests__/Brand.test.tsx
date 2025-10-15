import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Brand } from "../Brand";

describe("Brand", () => {
  it("renders logo mark image", () => {
    render(<Brand />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/brand/logo-mark.svg");
  });

  it("links to home page", () => {
    render(<Brand />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/");
  });

  it("has accessible label", () => {
    render(<Brand />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-label")).toBe("Spot Light Trader - Home");
  });

  it("displays SPOT LIGHT wordmark", () => {
    render(<Brand />);
    expect(screen.getByText("SPOT LIGHT")).toBeDefined();
  });

  it("displays TRADER subtitle", () => {
    render(<Brand />);
    expect(screen.getByText("TRADER")).toBeDefined();
  });
});
