import { test, expect, DASH, signupViaApi } from "./fixtures";

const row = (page, symbol) => page.getByRole("list", { name: "Watchlist" }).locator("li", { hasText: symbol }).first();

async function placeOrder(page, symbol, side, qty) {
  await row(page, symbol).hover();
  await page.getByRole("button", { name: `${side === "BUY" ? "Buy" : "Sell"} ${symbol}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quantity").fill(String(qty));
  await dialog.getByRole("button", { name: side === "BUY" ? "Buy" : "Sell" }).click();
}

test.describe("trading dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signupViaApi(page);
    await page.goto(DASH);
    await expect(row(page, "AAPL")).toContainText("190.00");
  });

  test("labels demo prices as sample data", async ({ page, errors }) => {
    await expect(page.getByRole("status").filter({ hasText: "Sample data" })).toBeVisible();
    await expect(page.getByText("S&P 500 (SPY)")).toBeVisible();
    await expect(page.locator(".nifty .index-points")).toHaveText("500.00");
    void errors;
  });

  test("buying updates holdings, orders, positions and funds", async ({ page, errors }) => {
    await placeOrder(page, "AAPL", "BUY", 5);
    await expect(page.getByText("Bought 5 AAPL at $190.00 (simulated)")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("link", { name: "Holdings" }).click();
    const holding = page.locator(".order-table tbody tr", { hasText: "AAPL" });
    await expect(holding).toContainText("950.00");
    await expect(page.getByRole("heading", { name: "Holdings (1)" })).toBeVisible();

    await page.getByRole("link", { name: "Orders" }).click();
    await expect(page.locator(".order-table tbody tr").first()).toContainText("BUY");
    await expect(page.locator(".order-table tbody tr").first()).toContainText("Market · sample");
    await expect(page.getByText("All orders are simulated")).toBeVisible();

    await page.getByRole("link", { name: "Positions" }).click();
    await expect(page.locator(".order-table tbody tr", { hasText: "AAPL" })).toContainText("5");

    await page.getByRole("link", { name: "Funds" }).click();
    await expect(page.locator(".table .data", { hasText: "Available cash" })).toContainText("99,050.00");

    await page.goto(DASH + "/holdings");
    await expect(page.locator(".order-table tbody tr", { hasText: "AAPL" })).toContainText("950.00");
    void errors;
  });

  test("sell is validated against holdings and then executes", async ({ page, errors }) => {
    await placeOrder(page, "MSFT", "BUY", 2);
    await expect(page.getByText(/Bought 2 MSFT/)).toBeVisible();

    await row(page, "MSFT").hover();
    await page.getByRole("button", { name: "Sell MSFT" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Available 2 sh");
    await dialog.getByLabel("Quantity").fill("3");
    await expect(dialog.getByRole("alert")).toHaveText("You have 2 unreserved share(s) of MSFT.");
    await expect(dialog.getByRole("button", { name: "Sell" })).toBeDisabled();
    await dialog.getByLabel("Quantity").fill("2");
    await dialog.getByRole("button", { name: "Sell" }).click();
    await expect(page.getByText("Sold 2 MSFT at $410.00 (simulated)")).toBeVisible();

    await page.getByRole("link", { name: "Holdings" }).click();
    await expect(page.getByText("You don't have any holdings yet")).toBeVisible();
    void errors;
  });

  test("cancel and Escape close the order window without placing an order", async ({ page, errors }) => {
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "Buy AAPL" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "Buy AAPL" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: "Orders" }).click();
    await expect(page.getByText("You haven't placed any orders yet")).toBeVisible();
    void errors;
  });

  test("keyboard shortcut B opens the buy window from a focused row", async ({ page, errors }) => {
    await row(page, "NVDA").focus();
    await page.keyboard.press("b");
    await expect(page.getByRole("dialog")).toContainText("Buy NVDA");
    void errors;
  });

  test("watchlist add and remove persist across reloads", async ({ page, errors }) => {
    await page.getByLabel(/Search US stocks to add to/).fill("coca");
    await page.getByRole("button", { name: /KO.*Coca-Cola.*Add/ }).click();
    await expect(page.getByText("KO added to Watchlist 1")).toBeVisible();
    await expect(page.getByText("10 / 50")).toBeVisible();
    await page.reload();
    await expect(row(page, "KO")).toContainText("62.00");

    await row(page, "KO").hover();
    await page.getByRole("button", { name: "More actions for KO" }).click();
    await page.getByRole("menuitem", { name: "Remove from watchlist" }).click();
    await expect(page.getByText("KO removed from Watchlist 1")).toBeVisible();
    await page.reload();
    await expect(page.getByText("9 / 50")).toBeVisible();
    await expect(page.getByRole("list", { name: "Watchlist" }).locator("li", { hasText: /^KO/ })).toHaveCount(0);
    void errors;
  });

  test("search explains when nothing matches", async ({ page, errors }) => {
    await page.getByLabel(/Search US stocks to add to/).fill("qqqzzz");
    await expect(page.getByText(/No US stocks match/)).toBeVisible();
    void errors;
  });

  test("funds can be added and withdrawn with validation", async ({ page, errors }) => {
    await page.getByRole("link", { name: "Funds" }).click();
    await page.getByRole("button", { name: "Add funds" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount in USD").fill("12.345");
    await dialog.getByRole("button", { name: "Add funds" }).click();
    await expect(dialog.getByText("Enter a positive amount with at most 2 decimal places.")).toBeVisible();
    await dialog.getByLabel("Amount in USD").fill("500");
    await dialog.getByRole("button", { name: "Add funds" }).click();
    await expect(page.getByText("Added $500.00 of virtual funds")).toBeVisible();
    await expect(page.locator(".table .data", { hasText: "Available cash" })).toContainText("100,500.00");

    await page.getByRole("button", { name: "Withdraw" }).click();
    await page.getByRole("dialog").getByLabel("Amount in USD").fill("200000");
    await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByRole("dialog").getByText(/You can withdraw at most/)).toBeVisible();
    await page.getByRole("dialog").getByLabel("Amount in USD").fill("100.5");
    await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
    await expect(page.locator(".table .data", { hasText: "Available cash" })).toContainText("100,399.50");
    void errors;
  });

  test("analytics explains the session-only chart and sample data", async ({ page, errors }) => {
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "Analytics for AAPL" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Apple Inc");
    await expect(dialog).toContainText("$190.00");
    await dialog.getByRole("tab", { name: "Chart" }).click();
    await expect(dialog).toContainText("Sample data: these are fixed demo prices, not market data.");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    void errors;
  });

  test("every dashboard menu link renders a page", async ({ page, errors }) => {
    for (const [label, text] of [
      ["Orders", "You haven't placed any orders yet"],
      ["Holdings", "You don't have any holdings yet"],
      ["Positions", "Positions (0)"],
      ["Funds", "Available cash"],
      ["Alerts", "No active alerts."],
      ["Analytics", "Portfolio analytics"],
      ["Dashboard", "Hi, E2E!"],
    ]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByText(text).first()).toBeVisible();
    }
    await page.goto(DASH + "/no-such-page");
    await expect(page.getByText("This page does not exist.")).toBeVisible();
    void errors;
  });
});

test.describe("failure handling", () => {
  test.use({ allowConsole: [/Failed to load resource|ERR_FAILED|WebSocket/] });

  test("API failures show an error instead of empty data", async ({ page, errors }) => {
    await signupViaApi(page);
    await page.route("**/api/holdings", (route) => route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "The database is temporarily unavailable." } } }));
    await page.goto(DASH + "/holdings");
    await expect(page.getByText("The database is temporarily unavailable.")).toBeVisible();
    void errors;
  });

  test("a failed realtime connection is shown, not hidden", async ({ page, errors }) => {
    await signupViaApi(page);
    await page.route("**/socket.io/**", (route) => route.abort());
    await page.goto(DASH);
    await expect(page.getByRole("status").filter({ hasText: /Connecting|Reconnecting/ })).toBeVisible();
    await expect(row(page, "AAPL")).toContainText("190.00");
    void errors;
  });

  test("an unreachable backend shows a retry screen", async ({ page, errors }) => {
    await page.route("**/api/auth/me", (route) => route.abort());
    await page.goto(DASH);
    await expect(page.getByText("Cannot reach the server. Check that the backend is running.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    void errors;
  });
});

test.describe("mobile dashboard", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("is usable without horizontal scrolling", async ({ page, errors }) => {
    await signupViaApi(page);
    for (const path of ["/", "/holdings", "/orders", "/positions", "/funds"]) {
      await page.goto(DASH + path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
    await page.goto(DASH);
    await row(page, "AAPL").click();
    await page.getByRole("button", { name: "Buy AAPL" }).click();
    await expect(page.getByRole("dialog")).toBeInViewport();
    void errors;
  });
});
