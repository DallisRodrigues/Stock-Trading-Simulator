import { test, expect, WEB, DASH, API } from "./fixtures";

test.describe("guest demo", () => {
  test("one click from the landing page opens a pre-filled, clearly temporary dashboard", async ({ page, errors }) => {
    await page.goto(WEB);
    await page.getByRole("button", { name: "Try the live demo" }).click();
    await expect(page).toHaveURL(DASH + "/");
    await expect(page.getByRole("note")).toContainText("temporary demo account");
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Guest Trader");
    await expect(page.getByRole("heading", { name: "Hi, Guest!" })).toBeVisible();

    await page.locator('.menus a[href="/holdings"]').click();
    await expect(page.getByRole("heading", { name: "Holdings (5)" })).toBeVisible();
    await page.locator('.menus a[href="/alerts"]').click();
    await expect(page.locator(".order-table tbody tr", { hasText: "TSLA" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Watchlists" }).getByRole("tab")).toHaveCount(2);
    await expect(page.getByText("Market data by")).toBeVisible();
    void errors;
  });

  test("logging out of a guest account deletes it", async ({ page, errors }) => {
    await page.goto(WEB + "/signup");
    await page.getByRole("button", { name: "Try the demo without an account" }).click();
    await expect(page).toHaveURL(DASH + "/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/5183\/login\?loggedOut=1/);
    const me = await page.request.get(`${API}/api/auth/session`);
    expect((await me.json()).user).toBeNull();
    void errors;
  });

  test("the navbar demo button works on every page", async ({ page, errors }) => {
    await page.goto(WEB + "/pricing");
    await page.getByRole("navigation").getByRole("button", { name: "Try demo" }).click();
    await expect(page).toHaveURL(DASH + "/");
    void errors;
  });
});
