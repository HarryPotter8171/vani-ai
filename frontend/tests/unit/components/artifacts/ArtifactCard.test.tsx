import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArtifactCard from "@/components/artifacts/ArtifactCard";
import type { Artifact } from "@/lib/artifacts";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "m1-artifact-0",
    messageId: "m1",
    index: 0,
    language: "javascript",
    title: "app.js",
    content: "line1\nline2\nline3",
    isStreaming: false,
    ...overrides,
  };
}

describe("ArtifactCard", () => {
  it("renders the artifact title, language label, and line count", () => {
    render(<ArtifactCard artifact={makeArtifact()} isActive={false} onOpen={vi.fn()} />);
    expect(screen.getByText("app.js")).toBeInTheDocument();
    expect(screen.getByText(/JavaScript/)).toBeInTheDocument();
    expect(screen.getByText(/3 lines/)).toBeInTheDocument();
  });

  it("shows a 'Generating…' label while streaming instead of a line count", () => {
    render(<ArtifactCard artifact={makeArtifact({ isStreaming: true })} isActive={false} onOpen={vi.fn()} />);
    expect(screen.getByText(/Generating…/)).toBeInTheDocument();
    expect(screen.queryByText(/lines/)).not.toBeInTheDocument();
  });

  it("calls onOpen with the artifact id when clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ArtifactCard artifact={makeArtifact()} isActive={false} onOpen={onOpen} />);
    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith("m1-artifact-0");
  });

  it("applies active styling when isActive is true", () => {
    render(<ArtifactCard artifact={makeArtifact()} isActive onOpen={vi.fn()} />);
    expect(screen.getByRole("button").className).toMatch(/border-primary/);
  });
});
