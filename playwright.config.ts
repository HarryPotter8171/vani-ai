import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_PORT = 5057;
const FRONTEND_PORT = 3100;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Shared HS256 secret the frontend uses to mint backend access JWTs and the
// backend uses to verify them (AUTH_JWT_SECRET, see backend/utils/jwt.js and
// frontend/lib/auth/token.ts). E2E-only value — never used outside this suite.
const E2E_AUTH_SECRET = 'vani-e2e-shared-secret-do-not-use-in-production-0123456789';
const E2E_DEV_EMAIL = 'e2e-tester@vani.test';

export default defineConfig({
  testDir: path.join(__dirname, 'e2e/tests'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/startServer.mjs',
      cwd: path.join(__dirname, 'backend'),
      url: BACKEND_URL,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'test',
        VANI_E2E_MODE: 'true',
        // Non-prod stdio MCP is gated (RC2-1); E2E needs the local echo server.
        MCP_ALLOW_STDIO: 'true',
        AUTH_JWT_SECRET: E2E_AUTH_SECRET,
        NEXTAUTH_SECRET: E2E_AUTH_SECRET,
        CORS_ORIGINS: FRONTEND_URL,
        NEXT_PUBLIC_APP_URL: FRONTEND_URL,
      },
    },
    {
      command: `npx next dev -p ${FRONTEND_PORT}`,
      cwd: path.join(__dirname, 'frontend'),
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(FRONTEND_PORT),
        NODE_ENV: 'development',
        // Isolated build output dir so this instance doesn't collide with a
        // developer's own `next dev` running in the same frontend/ directory.
        VANI_E2E_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_API_BASE_URL: `${BACKEND_URL}/api`,
        // constants.ts LAN path ignores NEXT_PUBLIC_API_BASE_URL; port override
        // points the browser at the Playwright backend (5057), not :5001.
        NEXT_PUBLIC_API_PORT: String(BACKEND_PORT),
        NEXTAUTH_URL: FRONTEND_URL,
        NEXTAUTH_SECRET: E2E_AUTH_SECRET,
        AUTH_JWT_SECRET: E2E_AUTH_SECRET,
        ALLOW_DEV_AUTH: 'true',
        NEXT_PUBLIC_ALLOW_DEV_AUTH: 'true',
        AUTH_DEV_EMAIL: E2E_DEV_EMAIL,
        AUTH_DEV_NAME: 'E2E Tester',
        GOOGLE_CLIENT_ID: 'e2e-unused',
        GOOGLE_CLIENT_SECRET: 'e2e-unused',
      },
    },
  ],
});
