import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatSummary } from "@/lib/types";

vi.mock("@/components/auth/UserMenu", () => ({ default: () => <div data-testid="user-menu" /> }));
vi.mock("@/components/chat/ExportMenu", () => ({ default: () => <div data-testid="export-menu" /> }));
vi.mock("@/components/chat/ShareMenu", () => ({ default: () => <div data-testid="share-menu" /> }));

const { default: Sidebar } = await import("@/components/Sidebar");
const { ThemeProvider } = await import("@/components/layout/ThemeProvider");

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <ThemeProvider>
      <Sidebar isOpen onClose={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

function setInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

function chats(): ChatSummary[] {
  return [
    { id: "1", title: "Trip to Japan", updatedAt: new Date().toISOString(), pinned: false },
    { id: "2", title: "Budget review", updatedAt: new Date().toISOString(), pinned: true },
  ];
}

describe("Sidebar: mobile drawer / desktop layout", () => {
  afterEach(() => {
    setInnerWidth(1024);
  });

  it("marks the drawer closed when isOpen is false", () => {
    const { container } = render(
      <ThemeProvider>
        <Sidebar isOpen={false} onClose={vi.fn()} />
      </ThemeProvider>
    );
    const aside = container.querySelector("aside")!;
    expect(aside.getAttribute("data-state")).toBe("closed");
  });

  it("marks the drawer open when isOpen is true", () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("aside")!;
    expect(aside.getAttribute("data-state")).toBe("open");
  });

  it("shows a backdrop only when isOpen, and clicking it calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container, rerender } = render(
      <ThemeProvider>
        <Sidebar isOpen={false} onClose={onClose} />
      </ThemeProvider>
    );
    expect(container.querySelector(".fixed.inset-0.modal-overlay")).not.toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <Sidebar isOpen onClose={onClose} />
      </ThemeProvider>
    );
    const backdrop = container.querySelector(".fixed.inset-0.modal-overlay")!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Sidebar: new chat + navigation", () => {
  it("calls onNewChat and closes the drawer on mobile widths", async () => {
    setInnerWidth(500);
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    const onClose = vi.fn();
    renderSidebar({ onClose, onNewChat });

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not auto-close on desktop widths", async () => {
    setInnerWidth(1200);
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    const onClose = vi.fn();
    renderSidebar({ onClose, onNewChat });

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows Settings exactly once", () => {
    renderSidebar();
    expect(screen.getAllByRole("button", { name: /^Settings$/i })).toHaveLength(1);
  });
});

describe("Sidebar: chat history", () => {
  it("renders recent chats and forwards selection", async () => {
    const user = userEvent.setup();
    const onSelectChat = vi.fn();
    renderSidebar({ recentChats: chats(), onSelectChat });

    await user.click(screen.getByRole("button", { name: /Trip to Japan/i }));
    expect(onSelectChat).toHaveBeenCalledWith("1");
  });

  it("opens the floating search panel from the Search nav item", async () => {
    const user = userEvent.setup();
    renderSidebar({ recentChats: chats() });
    await user.click(screen.getByRole("button", { name: /^Search$/i }));
    expect(screen.getByPlaceholderText("Search conversations...")).toBeInTheDocument();
  });

  it("shows the empty state copy when there are no chats", () => {
    renderSidebar({ recentChats: [] });
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });
});

describe("Sidebar: keyboard shortcuts", () => {
  beforeEach(() => {
    setInnerWidth(1200);
  });

  it("Ctrl/Cmd+Shift+O triggers a new chat", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    renderSidebar({ onNewChat });

    await user.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");
    expect(onNewChat).toHaveBeenCalled();
  });
});

describe("Sidebar: desktop collapse rail", () => {
  beforeEach(() => {
    setInnerWidth(1200);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("768"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("uses 70px width when collapsed and keeps icon affordances", () => {
    const { container } = render(
      <ThemeProvider>
        <Sidebar isOpen isCollapsed onClose={vi.fn()} onToggleCollapsed={vi.fn()} />
      </ThemeProvider>
    );
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-collapsed");
    expect(aside).toHaveAttribute("data-sidebar-width", "70");
    expect(screen.getByLabelText("New Chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Chats")).toBeInTheDocument();
    // Sole hamburger lives in Header — sidebar brand has no duplicate toggle.
    expect(screen.queryByLabelText("Expand sidebar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
  });

  it("uses default 280px width when expanded", () => {
    const { container } = renderSidebar({ isCollapsed: false });
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-sidebar-width", "280");
    expect(aside).not.toHaveAttribute("data-collapsed");
  });
});

describe("Sidebar: projects", () => {
  it("switches to Personal chats when clicked", async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    renderSidebar({
      activeProjectId: "proj-1",
      onSelectProject,
    });
    // Projects section is collapsed by default — expand it first.
    await user.click(
      screen.getByRole("button", { name: /^Projects$/i, expanded: false })
    );
    await user.click(screen.getByRole("button", { name: /personal chats/i }));
    expect(onSelectProject).toHaveBeenCalledWith(null);
  });
});
