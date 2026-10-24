// @ts-check
import { defineConfig, devices } from "@playwright/test";

const API = "http://localhost:3102";
const WEB = "http://localhost:5183";
const DASH = "http://localhost:5184";
const viteEnv = { VITE_API_URL: API, VITE_DASHBOARD_URL: DASH, VITE_LANDING_URL: WEB };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm --prefix backend run start:e2e",
      url: `${API}/api/health`,
      env: { PORT: "3102", CORS_ORIGINS: `${WEB},${DASH}` },
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: "npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 5183 --strictPort",
      cwd: "./frontend",
      url: WEB,
      env: viteEnv,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 5184 --strictPort",
      cwd: "./dashboard",
      url: DASH,
      env: viteEnv,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});

export const URLS = { API, WEB, DASH };
