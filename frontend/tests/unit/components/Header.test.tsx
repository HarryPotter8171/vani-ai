import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { default: Header } = await import("@/components/Header");

describe("Header", () => {
  it("calls onToggleSidebar when the menu button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleSidebar = vi.fn();
    render(<Header onToggleSidebar={onToggleSidebar} />);
    await user.click(screen.getByLabelText("Toggle sidebar"));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it("renders the sidebar toggle — no floating feature chrome", () => {
    render(<Header />);
    expect(screen.getByLabelText("Toggle sidebar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open artifact")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Open canvas")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Open browser panel")).not.toBeInTheDocument();
    expect(screen.queryByText("VANI Pro")).not.toBeInTheDocument();
  });
});
