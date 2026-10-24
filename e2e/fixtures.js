import { test as base, expect } from "@playwright/test";

export const API = "http://localhost:3102";
export const WEB = "http://localhost:5183";
export const DASH = "http://localhost:5184";

let seq = 0;
export const uniqueEmail = () => `e2e-${Date.now()}-${++seq}@example.com`;

export const test = base.extend({
  allowConsole: [[], { option: true }],
  errors: async ({ page, allowConsole }, use) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (allowConsole.some((re) => re.test(text))) return;
      errors.push(`console.error: ${text}`);
    });
    await use(errors);
    expect(errors, "unexpected browser errors").toEqual([]);
  },
});

export async function signupViaApi(page, overrides = {}) {
  const body = { name: "E2E Trader", email: uniqueEmail(), password: "password123", ...overrides };
  const res = await page.request.post(`${API}/api/auth/signup`, { data: body, headers: { Origin: WEB } });
  expect(res.status()).toBe(201);
  return body;
}

export { expect };
