import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Message from "@/components/Message";
import type { MessageAttachment } from "@/lib/types";

describe("Message: user bubble", () => {
  it("renders plain text content", () => {
    render(<Message id="m1" role="user" content="Hello there" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("shows a 'Forget this' action for finished user messages when a handler is provided", async () => {
    const user = userEvent.setup();
    const onForgetMemory = vi.fn();
    render(<Message id="m1" role="user" content="My favorite color is blue" onForgetMemory={onForgetMemory} />);

    const forgetBtn = screen.getByRole("button", { name: /forget this/i });
    await user.click(forgetBtn);
    expect(onForgetMemory).toHaveBeenCalledWith("My favorite color is blue");
  });

  it("hides 'Forget this' while the message is still streaming", () => {
    render(
      <Message id="m1" role="user" content="typing..." isStreaming onForgetMemory={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: /forget this/i })).not.toBeInTheDocument();
  });

  it("hides 'Forget this' when no handler is provided", () => {
    render(<Message id="m1" role="user" content="Hello" />);
    expect(screen.queryByRole("button", { name: /forget this/i })).not.toBeInTheDocument();
  });

  it("renders a non-image attachment chip and opens the lightbox on click", async () => {
    const user = userEvent.setup();
    const attachment: MessageAttachment = {
      id: "a1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 1024,
      kind: "pdf",
    };
    render(<Message id="m1" role="user" content="" attachments={[attachment]} />);

    const chip = screen.getByRole("button", { name: /report\.pdf/i });
    await user.click(chip);
    expect(screen.getByRole("dialog", { name: "report.pdf" })).toBeInTheDocument();
  });
});

describe("Message: assistant bubble", () => {
  it("renders assistant markdown content", () => {
    render(<Message id="m2" role="assistant" content="**bold** text" />);
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("promotes a substantial fenced code block to an ArtifactCard and reports it", () => {
    const onArtifactsDetected = vi.fn();
    const code = Array.from({ length: 12 }, (_, i) => `x${i} = ${i}`).join("\n");
    const content = `Here:\n\n\`\`\`python\n${code}\n\`\`\``;
    render(
      <Message id="m2" role="assistant" content={content} onArtifactsDetected={onArtifactsDetected} />
    );

    expect(screen.getByText(/12 lines/i)).toBeInTheDocument();
    expect(onArtifactsDetected).toHaveBeenCalledWith(
      "m2",
      expect.arrayContaining([expect.objectContaining({ language: "python" })])
    );
  });

  it("calls onOpenArtifact when an artifact card is clicked", async () => {
    const user = userEvent.setup();
    const onOpenArtifact = vi.fn();
    const code = Array.from({ length: 12 }, (_, i) => `x${i} = ${i}`).join("\n");
    const content = `\`\`\`python\n${code}\n\`\`\``;
    render(<Message id="m2" role="assistant" content={content} onOpenArtifact={onOpenArtifact} />);

    await user.click(screen.getByRole("button", { name: /12 lines/i }));
    expect(onOpenArtifact).toHaveBeenCalledWith("m2-artifact-0");
  });

  it("never reports artifacts for user messages", () => {
    const onArtifactsDetected = vi.fn();
    const code = Array.from({ length: 12 }, (_, i) => `x${i} = ${i}`).join("\n");
    render(
      <Message
        id="m3"
        role="user"
        content={`\`\`\`python\n${code}\n\`\`\``}
        onArtifactsDetected={onArtifactsDetected}
      />
    );
    expect(onArtifactsDetected).not.toHaveBeenCalled();
  });

  it("renders an inline image attachment", () => {
    const attachment: MessageAttachment = {
      id: "img1",
      name: "photo.png",
      mimeType: "image/png",
      size: 2048,
      kind: "image",
      previewUrl: "blob:mock-preview",
    };
    render(<Message id="m4" role="assistant" content="Here's the image" attachments={[attachment]} />);
    expect(screen.getByAltText("photo.png")).toBeInTheDocument();
  });

  it("renders an inline image attachment with backend imageUrl", () => {
    const attachment: MessageAttachment = {
      id: "img2",
      fileId: "file-123",
      name: "generated-image.png",
      mimeType: "image/png",
      size: 4096,
      kind: "image",
      previewUrl: "http://localhost:5001/api/files/file-123/content?access_token=mock",
    };
    render(<Message id="m5" role="assistant" content="Generated image" attachments={[attachment]} />);
    expect(screen.getByAltText("generated-image.png")).toBeInTheDocument();
  });
});
