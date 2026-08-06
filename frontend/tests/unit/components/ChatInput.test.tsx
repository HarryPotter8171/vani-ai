import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingAttachment } from "@/lib/types";

const useFileUploadMock = vi.fn();
vi.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => useFileUploadMock(),
}));

const { default: ChatInput } = await import("@/components/ChatInput");

function baseFileUploadState(overrides: Partial<ReturnType<typeof useFileUploadMock>> = {}) {
  return {
    attachments: [] as PendingAttachment[],
    ingestFiles: vi.fn(),
    removeAttachment: vi.fn(),
    cancelAttachment: vi.fn(),
    retryAttachment: vi.fn(),
    reorderAttachments: vi.fn(),
    moveAttachment: vi.fn(),
    clearAttachments: vi.fn(),
    takeReadyAttachments: vi.fn(() => []),
    isReading: false,
    isAnalyzing: false,
    hasReady: false,
    hasError: false,
    ...overrides,
  };
}

describe("ChatInput", () => {
  beforeEach(() => {
    useFileUploadMock.mockReset();
    useFileUploadMock.mockReturnValue(baseFileUploadState());
  });

  it("disables the send button until text is entered", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={vi.fn()} />);

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Message VANI…"), "Hello there");
    expect(sendButton).toBeEnabled();
  });

  it("submits the trimmed message and clears the input on Enter", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText("Message VANI…");
    await user.type(textarea, "  Hello world  {Enter}");

    expect(onSendMessage).toHaveBeenCalledWith("Hello world", undefined);
    expect(textarea).toHaveValue("");
  });

  it("inserts a newline instead of submitting on Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText("Message VANI…");
    await user.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Line one\nLine two");
  });

  it("submits via the send button click", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} />);

    await user.type(screen.getByPlaceholderText("Message VANI…"), "Click send");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSendMessage).toHaveBeenCalledWith("Click send", undefined);
  });

  it("does not submit whitespace-only input", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatInput onSendMessage={onSendMessage} />);

    await user.type(screen.getByPlaceholderText("Message VANI…"), "   {Enter}");
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("shows a stop button while loading and calls onStopGenerating on click", async () => {
    const user = userEvent.setup();
    const onStopGenerating = vi.fn();
    render(<ChatInput onSendMessage={vi.fn()} isLoading onStopGenerating={onStopGenerating} />);

    const stopButton = screen.getByRole("button", { name: "Stop generating" });
    expect(stopButton).toBeEnabled();
    await user.click(stopButton);
    expect(onStopGenerating).toHaveBeenCalled();
  });

  it("disables the textarea and plus menu while loading", () => {
    render(<ChatInput onSendMessage={vi.fn()} isLoading />);
    expect(screen.getByPlaceholderText("Message VANI…")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add attachments and tools" })).toBeDisabled();
  });

  it("enables send when there are ready attachments, even with empty text", () => {
    useFileUploadMock.mockReturnValue(baseFileUploadState({ hasReady: true }));
    render(<ChatInput onSendMessage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("disables send while attachments are still being read/analyzed", () => {
    useFileUploadMock.mockReturnValue(baseFileUploadState({ hasReady: true, isReading: true }));
    render(<ChatInput onSendMessage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("disables the voice button when no onOpenVoiceMode handler is provided", () => {
    render(<ChatInput onSendMessage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start voice mode" })).toBeDisabled();
  });

  it("enables and triggers the voice button when a handler is provided", async () => {
    const user = userEvent.setup();
    const onOpenVoiceMode = vi.fn();
    render(<ChatInput onSendMessage={vi.fn()} onOpenVoiceMode={onOpenVoiceMode} />);
    const voiceButton = screen.getByRole("button", { name: "Start voice mode" });
    expect(voiceButton).toBeEnabled();
    await user.click(voiceButton);
    expect(onOpenVoiceMode).toHaveBeenCalled();
  });

  it("keeps Message VANI placeholder when deep research is enabled", () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        deepResearchEnabled
        webSearchEnabled={false}
        onToggleWebSearch={vi.fn()}
        onToggleDeepResearch={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Message VANI…")).toBeInTheDocument();
  });
});
