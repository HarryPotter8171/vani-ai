import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatHistoryItem from "@/components/sidebar/ChatHistoryItem";
import type { ChatSummary } from "@/lib/types";

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return { id: "chat-1", title: "Weekend trip planning", pinned: false, ...overrides };
}

describe("ChatHistoryItem", () => {
  it("renders the chat title and calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChatHistoryItem chat={chat()} isActive={false} onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: /weekend trip planning/i });
    await user.click(button);
    expect(onSelect).toHaveBeenCalledWith("chat-1");
  });

  it("shows a pin indicator for pinned chats", () => {
    render(<ChatHistoryItem chat={chat({ pinned: true })} isActive={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Unpin conversation")).toBeInTheDocument();
  });

  it("highlights matching search query text", () => {
    render(<ChatHistoryItem chat={chat()} isActive={false} query="trip" onSelect={vi.fn()} />);
    const mark = document.querySelector("mark");
    expect(mark).toHaveTextContent(/trip/i);
  });

  it("opens the actions menu and pins/unpins via the menu", async () => {
    const user = userEvent.setup();
    const onPin = vi.fn();
    render(<ChatHistoryItem chat={chat({ pinned: false })} isActive={false} onSelect={vi.fn()} onPin={onPin} />);

    await user.click(screen.getByLabelText("Conversation actions"));
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /pin/i }));
    expect(onPin).toHaveBeenCalledWith("chat-1", true);
  });

  it("deletes via the menu", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ChatHistoryItem chat={chat()} isActive={false} onSelect={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByLabelText("Conversation actions"));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("chat-1");
  });

  it("renames via the menu: Enter commits a non-empty, changed title", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ChatHistoryItem chat={chat()} isActive={false} onSelect={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByLabelText("Conversation actions"));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));

    const input = screen.getByLabelText("Rename conversation");
    await user.clear(input);
    await user.type(input, "New title{Enter}");

    expect(onRename).toHaveBeenCalledWith("chat-1", "New title");
  });

  it("does not commit a rename when the title is unchanged", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ChatHistoryItem chat={chat()} isActive={false} onSelect={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByLabelText("Conversation actions"));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));
    await user.type(screen.getByLabelText("Rename conversation"), "{Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });

  it("cancels an in-progress rename on Escape without calling onRename", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ChatHistoryItem chat={chat()} isActive={false} onSelect={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByLabelText("Conversation actions"));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));

    const input = screen.getByLabelText("Rename conversation");
    await user.type(input, " extra{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Rename conversation")).not.toBeInTheDocument();
    expect(screen.getByText("Weekend trip planning")).toBeInTheDocument();
  });

  it("applies active styling classes when isActive is true", () => {
    render(<ChatHistoryItem chat={chat()} isActive onSelect={vi.fn()} />);
    const button = screen.getByRole("button", { name: /weekend trip planning/i });
    expect(button.className).toMatch(/text-accent/);
  });
});
