import { test, expect, DASH, signupViaApi } from "./fixtures";

const watchlist = (page) => page.getByRole("list", { name: "Watchlist" });
const row = (page, symbol) => watchlist(page).locator("li", { hasText: symbol }).first();

test.describe("quality-of-life features", () => {
  test.beforeEach(async ({ page }) => {
    await signupViaApi(page);
    await page.goto(DASH);
    await expect(row(page, "AAPL")).toContainText("190.00");
  });

  test("multiple watchlists: create, add, switch, rename, delete — persisted", async ({ page, errors }) => {
    const tabs = page.getByRole("tablist", { name: "Watchlists" });
    await tabs.getByRole("button", { name: "New watchlist" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Watchlist name").fill("Dividends");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Created “Dividends”")).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "2" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Dividends is empty.")).toBeVisible();

    await page.getByLabel("Search US stocks to add to Dividends").fill("coca");
    await page.getByRole("button", { name: /KO.*Coca-Cola.*Add/ }).click();
    await expect(row(page, "KO")).toContainText("62.00");

    await tabs.getByRole("tab", { name: "1" }).click();
    await expect(row(page, "AAPL")).toBeVisible();
    await expect(watchlist(page).locator("li", { hasText: /^KO/ })).toHaveCount(0);

    await tabs.getByRole("tab", { name: "2" }).click();
    await page.reload();
    await expect(row(page, "KO")).toBeVisible();

    await page.getByRole("button", { name: "Watchlist settings" }).click();
    await page.getByRole("menuitem", { name: /Rename/ }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Watchlist name").fill("Income");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(page.locator(".watchlist-tabs-name")).toHaveText("Income");

    await page.getByRole("button", { name: "Watchlist settings" }).click();
    await page.getByRole("menuitem", { name: "Delete watchlist" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("tablist", { name: "Watchlists" }).getByRole("tab")).toHaveCount(1);
    await expect(row(page, "AAPL")).toBeVisible();
    void errors;
  });

  test("watchlist rows can be reordered and the order persists", async ({ page, errors }) => {
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "More actions for AAPL" }).click();
    await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    await page.getByRole("menuitem", { name: "Move down" }).click();
    await expect(watchlist(page).locator("li").nth(0)).toContainText("MSFT");
    await expect(watchlist(page).locator("li").nth(1)).toContainText("AAPL");
    await page.reload();
    await expect(watchlist(page).locator("li").nth(0)).toContainText("MSFT");

    await row(page, "NVDA").dragTo(watchlist(page).locator("li").nth(0));
    await expect(watchlist(page).locator("li").nth(0)).toContainText("NVDA");
    await page.reload();
    await expect(watchlist(page).locator("li").nth(0)).toContainText("NVDA");
    void errors;
  });

  test("command palette navigates, opens stocks and trades from the keyboard", async ({ page, errors }) => {
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Command palette" });
    await expect(input).toBeFocused();
    await input.fill("orders");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(DASH + "/orders");

    await page.getByRole("button", { name: "Open command palette" }).click();
    await page.getByRole("combobox", { name: "Command palette" }).fill("micro");
    await expect(page.getByRole("option", { name: /Buy MSFT/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Buy MSFT");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Command palette" }).fill("tesla");
    await page.getByRole("option", { name: /^TSLA/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Tesla Inc");
    void errors;
  });

  test("dark theme toggles from the profile menu and persists", async ({ page, errors }) => {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgDark).not.toBe(bgLight);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(row(page, "AAPL")).toContainText("190.00");
    void errors;
  });

  test("analytics shows performance against the S&P 500", async ({ page, errors }) => {
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "Buy AAPL" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Buy" }).click();
    await expect(page.getByText(/Bought 1 AAPL/)).toBeVisible();
    await page.locator('.menus a[href="/funds"]').click();
    await page.getByRole("button", { name: "Add funds" }).click();
    await page.getByRole("dialog").getByLabel("Amount in USD").fill("1000");
    await page.getByRole("dialog").getByRole("button", { name: "Add funds" }).click();
    await expect(page.getByText("Added $1,000.00 of virtual funds")).toBeVisible();

    await page.locator('.menus a[href="/analytics"]').click();
    const perf = page.locator(".chart-card", { hasText: "Performance vs S&P 500 (SPY)" });
    await expect(perf).toContainText("You 0.00% · SPY 0.00%");
    await perf.getByRole("button", { name: "Table" }).click();
    await expect(perf.locator("tbody tr").first()).toContainText("0.00%");
    void errors;
  });
});
