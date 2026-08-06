import { test, expect, type APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Full user-journey E2E test — drives the REAL frontend (Next.js) + REAL
 * backend (Express) + REAL database (in-memory Mongo) through a single
 * authenticated session, end to end:
 *
 *   login -> chat -> memory -> document upload -> image generation ->
 *   voice mode -> deep research -> MCP -> browser automation -> logout
 *
 * The only thing that is not "real" is the outbound Gemini/Vertex AI client
 * (see backend/services/testDoubles/mockGeminiClient.js, activated only via
 * VANI_E2E_MODE=true in playwright.config.ts) — every other code path
 * (auth, persistence, file parsing, MCP transport, browser permission
 * gating, deep research state machine) is exercised exactly as in
 * production.
 *
 * Steps whose primary trigger is the chat agent's own tool-calling decision
 * (browser automation, deep research, MCP, voice) are driven at the REST API
 * boundary using the same bearer token the real frontend mints for its own
 * session (via `/api/auth/backend-token`) — this is exactly what the
 * corresponding frontend hooks (useBrowser, useDeepResearch, useMcp,
 * useVoiceMode) call under the hood, so the backend contract is exercised
 * for real, without depending on flaky natural-language tool selection.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.E2E_API_URL || 'http://localhost:5057/api';
const ECHO_MCP_SERVER_PATH = path.resolve(__dirname, '../../backend/mcp/servers/echoServer.js');
const TEST_DOCUMENT_PATH = path.resolve(__dirname, '../fixtures/e2e-test-document.txt');

const IMAGE_TRIGGER = '[[E2E_GENERATE_IMAGE]]';

async function getBackendToken(page: import('@playwright/test').Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const res = await fetch('/api/auth/backend-token');
    if (!res.ok) throw new Error(`backend-token failed: ${res.status}`);
    const body = await res.json();
    return body.token as string;
  });
  expect(token).toBeTruthy();
  return token;
}

function authed(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request.get(`${API_BASE}${url}`, { headers }),
    post: (url: string, data?: unknown) => request.post(`${API_BASE}${url}`, { headers, data }),
    delete: (url: string) => request.delete(`${API_BASE}${url}`, { headers }),
  };
}

test.describe.serial('VANI AI — full user journey', () => {
  test('logs in, chats, uses memory, uploads a document, generates an image, uses voice, deep research, MCP, browser, and logs out', async ({
    page,
    request,
  }) => {
    // ---- 1. Login (dev-auth bypass — same cookie/session path as Google OAuth) ----
    await test.step('login', async () => {
      await page.goto('/');
      const devButton = page.getByRole('button', { name: /continue as developer/i });
      await expect(devButton).toBeVisible({ timeout: 20_000 });
      await devButton.click();
      await expect(page.getByPlaceholder('Message VANI…')).toBeVisible({ timeout: 20_000 });
    });

    // ---- 2. Chat: send a plain message, verify the streamed reply renders ----
    await test.step('chat', async () => {
      const input = page.getByPlaceholder('Message VANI…');
      await input.fill('Hello VANI, how are you today?');
      await input.press('Enter');
      await expect(page.getByText('Hello from mock VANI AI (E2E mode).')).toBeVisible({
        timeout: 20_000,
      });
    });

    // ---- 3. Memory: open the Memory Manager, add a memory, verify it's listed ----
    await test.step('memory', async () => {
      // Memory lives under the collapsed "More" sidebar section after UI polish.
      const moreToggle = page.getByRole('button', { name: /^More$/i });
      if (await moreToggle.isVisible().catch(() => false)) {
        await moreToggle.click();
      }
      await page.getByRole('button', { name: 'Memory' }).click();
      const dialog = page.getByRole('dialog', { name: /memory/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      await dialog.getByRole('button', { name: /add/i }).click();
      const memoryText = `E2E test memory ${Date.now()}`;
      await dialog.getByPlaceholder('What should VANI remember?').fill(memoryText);
      await dialog.getByRole('button', { name: /^save$/i }).click();

      await expect(dialog.getByText(memoryText)).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('button', { name: /close memory/i }).click();
      await expect(dialog).not.toBeVisible();
    });

    // ---- 4. Document upload: attach a real file via chat and send it ----
    await test.step('document upload', async () => {
      const fileInput = page.getByTestId('chat-file-input');
      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);
      await expect(page.getByText('e2e-test-document.txt').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/text ready/i).first()).toBeVisible({ timeout: 15_000 });

      const input = page.getByPlaceholder('Message VANI…');
      await input.fill('Please summarize the attached document.');
      await input.press('Enter');
      // The attachment renders inside the user's own chat bubble once sent.
      await expect(page.getByText('e2e-test-document.txt').first()).toBeVisible({ timeout: 15_000 });
    });

    // ---- 5. Image generation: chat message triggers the image_generation tool ----
    await test.step('image generation', async () => {
      const input = page.getByPlaceholder('Message VANI…');
      await input.fill(`Please create a picture of a mountain. ${IMAGE_TRIGGER}`);
      await input.press('Enter');
      await expect(page.getByRole('button', { name: /^View/i }).last()).toBeVisible({
        timeout: 20_000,
      });
    });

    // Mint the same backend access token the frontend itself uses, so the
    // remaining steps hit the real REST API as this authenticated user.
    const token = await getBackendToken(page);
    const api = authed(request, token);

    // ---- 6. Voice mode: create a session, transcribe, and synthesize speech ----
    await test.step('voice mode', async () => {
      const session = await api.post('/voice/session', { mode: 'push-to-talk' });
      expect(session.ok()).toBeTruthy();
      const { session: voiceSession } = await session.json();
      expect(voiceSession?.id).toBeTruthy();

      const stt = await request.post(`${API_BASE}/voice/stt`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          audio: {
            name: 'clip.webm',
            mimeType: 'audio/webm',
            buffer: Buffer.from('fake-audio-bytes-for-e2e'),
          },
          sessionId: voiceSession.id,
        },
      });
      expect(stt.ok()).toBeTruthy();
      const sttBody = await stt.json();
      expect(sttBody.transcript).toBeTruthy();

      const tts = await api.post('/voice/tts', { text: 'Hello from the E2E voice test.' });
      expect(tts.ok()).toBeTruthy();
      const ttsBody = await tts.json();
      expect(ttsBody.audioBase64).toBeTruthy();

      await api.delete(`/voice/session/${voiceSession.id}`);
    });

    // ---- 7. Deep Research: run the real pipeline (Gemini mocked) to completion ----
    await test.step('deep research', async () => {
      const res = await api.post('/research/run', {
        query: 'What is the tallest mountain on Earth?',
      });
      expect(res.ok()).toBeTruthy();
      const text = await res.text();
      const events = text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.slice('data: '.length)));

      expect(events.some((e) => e.type === 'session_start')).toBe(true);
      expect(events.some((e) => e.type === 'completed')).toBe(true);
    });

    // ---- 8. MCP: connect the local echo server, list tools, call one ----
    let mcpServerId: string;
    await test.step('mcp', async () => {
      const created = await api.post('/mcp/servers', {
        name: 'E2E Echo',
        transport: { type: 'stdio', command: process.execPath, args: [ECHO_MCP_SERVER_PATH] },
        connectNow: false,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
      expect(created.ok()).toBeTruthy();
      const { server } = await created.json();
      mcpServerId = server.id;

      const connected = await api.post(`/mcp/servers/${mcpServerId}/connect`);
      expect(connected.ok()).toBeTruthy();

      const tools = await api.get(`/mcp/servers/${mcpServerId}/tools`);
      expect(tools.ok()).toBeTruthy();
      const toolsBody = await tools.json();
      expect(toolsBody.tools?.some((t: { name: string }) => t.name === 'echo')).toBe(true);

      await api.post(`/mcp/servers/${mcpServerId}/permissions/grant`, { trustServer: true });

      const called = await api.post(`/mcp/servers/${mcpServerId}/tools/call`, {
        toolName: 'echo',
        arguments: { message: 'hello from e2e' },
      });
      expect(called.ok()).toBeTruthy();
      const calledBody = await called.json();
      expect(calledBody.content?.[0]?.text).toBe('hello from e2e');

      await api.post(`/mcp/servers/${mcpServerId}/disconnect`);
    });

    // ---- 9. Browser automation: start a run, approve it, observe it leave the
    //         awaiting-approval state. Full autonomous navigation is covered by
    //         backend/tests/integration/browser.test.js; this step proves the
    //         real permission-gated lifecycle works end to end. ----
    await test.step('browser automation', async () => {
      const started = await api.post('/browser/runs', {
        goal: 'Open the page and read its title',
        url: 'https://example.com',
      });
      expect(started.ok()).toBeTruthy();
      const startedBody = await started.json();
      expect(startedBody.needsApproval).toBe(true);
      expect(startedBody.snapshot.status).toBe('awaiting_approval');

      const approved = await api.post(`/browser/approvals/${startedBody.approval.approvalId}`, {
        choice: 'allow_once',
      });
      expect(approved.ok()).toBeTruthy();

      let finalStatus = 'awaiting_approval';
      for (let i = 0; i < 20; i += 1) {
        const run = await api.get(`/browser/runs/${startedBody.runId}`);
        const runBody = await run.json();
        finalStatus = runBody.run.status;
        if (finalStatus !== 'awaiting_approval' && finalStatus !== 'planning') break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(['running', 'completed', 'failed', 'cancelled']).toContain(finalStatus);

      await api.post(`/browser/runs/${startedBody.runId}/stop`).catch(() => {});
    });

    // ---- 10. Logout via the real UI ----
    await test.step('logout', async () => {
      // Account menu lives in the Personal sidebar section (not a top banner).
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('menuitem', { name: /sign out/i }).click();
      await expect(page.getByRole('button', { name: /continue as developer/i })).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
