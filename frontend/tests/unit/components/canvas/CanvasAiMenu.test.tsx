import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CanvasAiMenu from "@/components/canvas/CanvasAiMenu";

describe("CanvasAiMenu", () => {
  it("is closed by default and opens on trigger click", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={vi.fn()} />);
    expect(screen.queryByText("Rewrite")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByText("Rewrite")).toBeInTheDocument();
  });

  it("hides code-only actions for non-code canvas types", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.queryByText("Refactor code")).not.toBeInTheDocument();
    expect(screen.queryByText("Optimize code")).not.toBeInTheDocument();
  });

  it("shows code-only actions for code canvas types", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="code" hasSelection={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByText("Refactor code")).toBeInTheDocument();
  });

  it("shows a selection-scoped hint when there is a selection", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="markdown" hasSelection onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByText("Edits apply to the selection only")).toBeInTheDocument();
  });

  it("shows a whole-document hint when there is no selection", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByText("No selection — choose whole document")).toBeInTheDocument();
  });

  it("calls onAction with wholeDocument=true for a simple action when nothing is selected", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    await user.click(screen.getByText("Rewrite"));
    expect(onAction).toHaveBeenCalledWith("rewrite", { wholeDocument: true });
  });

  it("calls onAction with wholeDocument=false when there is a selection", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CanvasAiMenu type="markdown" hasSelection onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    await user.click(screen.getByText("Rewrite"));
    expect(onAction).toHaveBeenCalledWith("rewrite", { wholeDocument: false });
  });

  it("includes the target language for the translate action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    const langInput = screen.getByPlaceholderText("Translate language");
    await user.clear(langInput);
    await user.type(langInput, "French");
    await user.click(screen.getByText("Translate"));

    expect(onAction).toHaveBeenCalledWith("translate", { wholeDocument: true, targetLanguage: "French" });
  });

  it("runs a custom instruction and clears the input afterward", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    const customInput = screen.getByPlaceholderText("Custom instruction…");
    await user.type(customInput, "Make it punchier");
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(onAction).toHaveBeenCalledWith("custom", {
      wholeDocument: true,
      instruction: "Make it punchier",
    });
    // Menu closes after running a custom instruction.
    expect(screen.queryByPlaceholderText("Custom instruction…")).not.toBeInTheDocument();
  });

  it("disables the Run button until custom instruction has non-whitespace text", async () => {
    const user = userEvent.setup();
    render(<CanvasAiMenu type="markdown" hasSelection={false} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    const runButton = screen.getByRole("button", { name: "Run" });
    expect(runButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Custom instruction…"), "   ");
    expect(runButton).toBeDisabled();
  });

  it("disables the trigger and shows a spinner while busy", () => {
    render(<CanvasAiMenu type="markdown" hasSelection={false} busy onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeDisabled();
  });
});
