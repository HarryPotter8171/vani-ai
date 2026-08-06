import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SidebarSearchPanel from "@/components/sidebar/SidebarSearchPanel";
import type { ChatSummary } from "@/lib/types";

vi.mock("@/lib/memory", () => ({
  fetchMemorySettings: vi.fn(async () => ({ enabled: false, profile: {}, preferences: {} })),
  fetchMemories: vi.fn(async () => ({ memories: [], total: 0, limit: 40, offset: 0 })),
}));

vi.mock("@/lib/apiClient", () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

const chats: ChatSummary[] = [
  { id: "1", title: "Trip to Japan", updatedAt: new Date().toISOString() },
  { id: "2", title: "Budget review", updatedAt: new Date().toISOString() },
];

describe("SidebarSearchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <SidebarSearchPanel
        open={false}
        onClose={vi.fn()}
        chats={chats}
        projects={[]}
      />
    );
    expect(screen.queryByPlaceholderText("Search conversations...")).not.toBeInTheDocument();
  });

  it("focuses the input and lists recent chats when open", async () => {
    render(
      <SidebarSearchPanel open onClose={vi.fn()} chats={chats} projects={[]} />
    );
    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Trip to Japan")).toBeInTheDocument());
  });

  it("filters chats as the user types", async () => {
    const user = userEvent.setup();
    render(
      <SidebarSearchPanel open onClose={vi.fn()} chats={chats} projects={[]} />
    );
    await user.type(screen.getByPlaceholderText("Search conversations..."), "budget");
    expect(screen.getByText("Budget review")).toBeInTheDocument();
    expect(screen.queryByText("Trip to Japan")).not.toBeInTheDocument();
  });

  it("calls onSelectChat and onClose when a result is chosen", async () => {
    const user = userEvent.setup();
    const onSelectChat = vi.fn();
    const onClose = vi.fn();
    render(
      <SidebarSearchPanel
        open
        onClose={onClose}
        chats={chats}
        projects={[]}
        onSelectChat={onSelectChat}
      />
    );
    await user.click(screen.getByText("Trip to Japan"));
    expect(onSelectChat).toHaveBeenCalledWith("1");
    expect(onClose).toHaveBeenCalled();
  });
});
