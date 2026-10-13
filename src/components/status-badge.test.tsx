import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the label with the requested tone", () => {
    render(<StatusBadge label="Em andamento" tone="warning" />);

    const badge = screen.getByText("Em andamento");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-tone", "warning");
    expect(badge).toHaveClass("bg-status-warning-soft");
  });
});
