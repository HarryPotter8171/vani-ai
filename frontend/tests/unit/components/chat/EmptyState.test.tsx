import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useSessionMock = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

vi.mock("@/lib/memory", () => ({
  fetchMemories: vi.fn().mockResolvedValue({ memories: [], total: 0 }),
}));

const { default: EmptyState } = await import("@/components/chat/EmptyState");

describe("EmptyState", () => {
  beforeEach(() => {
    useSessionMock.mockReset();
  });

  it("shows a generic time-of-day greeting when unauthenticated", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<EmptyState />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Good (Morning|Afternoon|Evening)$/
    );
  });

  it("personalizes the greeting with the authenticated user's first name", () => {
    useSessionMock.mockReturnValue({
      data: { user: { name: "Ada Lovelace", email: "ada@vani.test" } },
      status: "authenticated",
    });
    render(<EmptyState />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Good (Morning|Afternoon|Evening), Ada$/
    );
  });

  it("does not personalize while the session is still loading", () => {
    useSessionMock.mockReturnValue({ data: null, status: "loading" });
    render(<EmptyState />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(/,/);
  });

  it("keeps the home surface calm — logo, wordmark, greeting only", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<EmptyState />);

    expect(screen.getByText("VANI")).toBeInTheDocument();
    expect(screen.queryByText(/Where should we begin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue working/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent chats/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested for you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Tips/i)).not.toBeInTheDocument();
  });

  it("does not show continue working or recent chats even when data is provided", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(
      <EmptyState
        recentChats={[
          {
            id: "c1",
            title: "Launch plan",
            updatedAt: new Date().toISOString(),
            lastMessage: "Draft the outline",
          },
        ]}
      />
    );

    expect(screen.queryByText(/Continue working/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent chats/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Launch plan")).not.toBeInTheDocument();
  });
});
