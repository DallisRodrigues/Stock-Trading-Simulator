import { test, expect, DASH, signupViaApi } from "./fixtures";

const menu = (page, path) => page.locator(`.menus a[href="${path}"]`);
const row = (page, symbol) => page.getByRole("list", { name: "Watchlist" }).locator("li", { hasText: symbol }).first();

async function buy(page, symbol, qty) {
  await row(page, symbol).hover();
  await page.getByRole("button", { name: `Buy ${symbol}` }).click();
  await page.getByRole("dialog").getByLabel("Quantity").fill(String(qty));
  await page.getByRole("dialog").getByRole("button", { name: "Buy" }).click();
  await expect(page.getByText(new RegExp(`Bought ${qty} ${symbol}`))).toBeVisible();
}

const card = (page, title) => page.locator(".chart-card", { has: page.getByRole("heading", { name: title, exact: true }) });

test.describe("analytics and charts", () => {
  test.beforeEach(async ({ page }) => {
    await signupViaApi(page);
    await page.goto(DASH);
    await expect(row(page, "AAPL")).toContainText("190.00");
  });

  test("analytics page explains itself on a new account", async ({ page, errors }) => {
    await menu(page, "/analytics").click();
    await expect(page.getByRole("heading", { name: "Portfolio analytics" })).toBeVisible();
    await expect(page.locator(".kpi", { hasText: "Account value" })).toContainText("$100,000.00");
    await expect(page.getByText("You have no holdings yet")).toBeVisible();
    await expect(card(page, "Allocation")).toContainText("No priced holdings yet.");
    await expect(card(page, "Trading activity (30 days)")).toContainText("No orders in the last 30 days.");
    void errors;
  });

  test("charts, tables and toggles reflect real holdings", async ({ page, errors }) => {
    await buy(page, "AAPL", 10);
    await buy(page, "AMD", 20);
    await menu(page, "/analytics").click();

    await expect(page.locator(".kpi", { hasText: "Diversification" })).toContainText("1.9");
    const allocation = card(page, "Allocation");
    await expect(allocation.locator("canvas")).toBeVisible();
    await allocation.getByRole("button", { name: "Table" }).click();
    await expect(allocation.getByRole("row", { name: /AAPL \$1,900.00 37.3%/ })).toBeVisible();
    await expect(allocation.getByRole("row", { name: /AMD \$3,200.00 62.7%/ })).toBeVisible();
    await allocation.getByRole("button", { name: "With cash" }).click();
    await expect(allocation.getByRole("row", { name: /Cash/ })).toBeVisible();

    const sectors = card(page, "Sector exposure");
    await sectors.getByRole("button", { name: "Table" }).click();
    await expect(sectors.getByRole("row", { name: /Technology/ })).toBeVisible();
    await expect(sectors.getByRole("row", { name: /Semiconductors/ })).toBeVisible();

    await expect(page.locator(".chart-card", { hasText: "Stock returns over" })).toContainText("Not available with sample data");
    await expect(card(page, "Unrealized P&L by holding")).toContainText("No gains or losses yet");

    const activity = card(page, "Trading activity (30 days)");
    await activity.getByRole("button", { name: "Table" }).click();
    await expect(activity.getByRole("row", { name: /\$5,100.00 \$0.00 2/ })).toBeVisible();

    const history = card(page, "Account value history");
    await expect(history.locator("canvas")).toBeVisible();
    await history.getByRole("button", { name: "Table" }).click();
    await expect(history.getByRole("row", { name: /Sample/ })).toHaveCount(2);
    void errors;
  });

  test("stock detail shows company data, ranges and honest gaps", async ({ page, errors }) => {
    await buy(page, "AAPL", 3);
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "Analytics for AAPL" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Apple Inc");
    await expect(dialog.getByText("52-week range (sample)")).toBeVisible();
    await expect(dialog.locator(".position-strip")).toContainText("3 shares");
    await expect(dialog).toContainText("Sample company data");
    await expect(dialog.locator(".chart-card", { hasText: "Analyst recommendations" })).toContainText("Not available with sample data");

    await dialog.getByRole("tab", { name: "Fundamentals" }).click();
    await expect(dialog.locator(".chart-card", { hasText: "Earnings per share" })).toContainText("Not available with sample data");
    await dialog.getByRole("tab", { name: "News" }).click();
    await expect(dialog).toContainText("Not available with sample data");
    await dialog.getByRole("tab", { name: "Chart" }).click();
    await expect(dialog).toContainText("Sample data: these are fixed demo prices");

    await dialog.getByRole("tab", { name: "Overview" }).click();
    await dialog.getByRole("button", { name: "MSFT", exact: true }).click();
    await expect(dialog).toContainText("Microsoft Corp");
    void errors;
  });

  test("dashboard home has a heatmap and movers that open stock details", async ({ page, errors }) => {
    const tiles = page.getByRole("list", { name: "Watchlist heatmap" }).getByRole("listitem");
    await expect(tiles).toHaveCount(9);
    await expect(page.locator(".movers")).toContainText("Top gainers");
    await expect(page.locator(".movers")).toContainText("NVDA");
    await tiles.filter({ hasText: "TSLA" }).click();
    await expect(page.getByRole("dialog")).toContainText("Tesla Inc");
    await expect(page.getByText("Today's change", { exact: true })).toBeVisible();
    void errors;
  });

  test("holdings page shows value and allocation charts", async ({ page, errors }) => {
    await buy(page, "MSFT", 2);
    await menu(page, "/holdings").click();
    await expect(card(page, "Invested vs current value").locator("canvas")).toBeVisible();
    await card(page, "Allocation").getByRole("button", { name: "Table" }).click();
    await expect(card(page, "Allocation").getByRole("row", { name: /MSFT 820.00 100.0%/ })).toBeVisible();
    void errors;
  });

  test("orders can be filtered and exported as CSV", async ({ page, errors }) => {
    await buy(page, "AAPL", 1);
    await buy(page, "AMD", 1);
    await menu(page, "/orders").click();
    await expect(page.getByRole("heading", { name: "Orders (2)" })).toBeVisible();
    await page.getByLabel("Filter by symbol").selectOption("AMD");
    await expect(page.getByRole("heading", { name: "Orders (1)" })).toBeVisible();
    await page.getByRole("group", { name: "Filter by side" }).getByRole("button", { name: "Sells" }).click();
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
    await page.getByRole("group", { name: "Filter by side" }).getByRole("button", { name: "All" }).click();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain(",BUY,MARKET,AMD,1,160,160,0,demo,");
    void errors;
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("analytics does not scroll horizontally", async ({ page, errors }) => {
      await buy(page, "AAPL", 1);
      await page.goto(DASH + "/analytics");
      await expect(page.locator(".kpi-row")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      void errors;
    });
  });
});
