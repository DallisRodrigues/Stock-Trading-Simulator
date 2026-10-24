import { test, expect, DASH, signupViaApi } from "./fixtures";

const menu = (page, path) => page.locator(`.menus a[href="${path}"]`);
const row = (page, symbol) => page.getByRole("list", { name: "Watchlist" }).locator("li", { hasText: symbol }).first();

async function openTicket(page, symbol, side = "Buy") {
  await row(page, symbol).hover();
  await page.getByRole("button", { name: `${side} ${symbol}` }).click();
  return page.getByRole("dialog");
}

test.describe("limit/stop orders, alerts and notifications", () => {
  test.use({ allowConsole: [/status of 422/] });

  test.beforeEach(async ({ page }) => {
    await signupViaApi(page);
    await page.goto(DASH);
    await expect(row(page, "AAPL")).toContainText("190.00");
  });

  test("a resting limit buy reserves cash and can be cancelled", async ({ page, errors }) => {
    const ticket = await openTicket(page, "AAPL");
    await ticket.getByRole("tab", { name: "Limit" }).click();
    await expect(ticket.getByLabel("Limit price")).toHaveValue("190.00");
    await ticket.getByLabel("Limit price").fill("150");
    await ticket.getByLabel("Quantity").fill("10");
    await expect(ticket).toContainText("Reserves $1,500.00");
    await ticket.getByLabel("Journal note").fill("waiting for a pullback");
    await ticket.getByRole("button", { name: "Place limit buy" }).click();
    await expect(page.getByText("Limit buy placed: 10 AAPL @ $150.00")).toBeVisible();

    await menu(page, "/funds").click();
    await expect(page.locator(".table .data", { hasText: "Available cash" })).toContainText("98,500.00");
    await expect(page.locator(".table .data", { hasText: "Reserved for open orders" })).toContainText("1,500.00");

    await menu(page, "/orders").click();
    await page.getByRole("tab", { name: /Open/ }).click();
    const openRow = page.locator(".order-table tbody tr", { hasText: "AAPL" });
    await expect(openRow).toContainText("Limit @ 150.00");
    await expect(openRow).toContainText("$1,500.00");
    await openRow.getByRole("button", { name: "Cancel BUY AAPL order" }).click();
    await expect(page.getByText("No open orders.")).toBeVisible();
    await page.getByRole("tab", { name: "Cancelled / expired" }).click();
    await expect(page.locator(".order-table tbody tr", { hasText: "AAPL" })).toContainText("Cancelled by you");

    await menu(page, "/funds").click();
    await expect(page.locator(".table .data", { hasText: "Available cash" })).toContainText("100,000.00");
    void errors;
  });

  test("a marketable limit order fills immediately and keeps its journal note", async ({ page, errors }) => {
    const ticket = await openTicket(page, "MSFT");
    await ticket.getByRole("tab", { name: "Limit" }).click();
    await ticket.getByLabel("Limit price").fill("420");
    await ticket.getByLabel("Quantity").fill("2");
    await ticket.getByLabel("Journal note").fill("cloud growth");
    await ticket.getByRole("button", { name: "Place limit buy" }).click();
    await expect(page.getByText("Bought 2 MSFT at $410.00 (simulated)")).toBeVisible();

    await menu(page, "/orders").click();
    const executed = page.locator(".order-table tbody tr", { hasText: "MSFT" });
    await expect(executed).toContainText("Limit @ 420.00");
    await expect(executed).toContainText("cloud growth");
    await executed.getByRole("button", { name: /Edit note/ }).click();
    await page.getByLabel("Journal note").fill("cloud growth + margins");
    await page.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.locator(".order-table tbody tr", { hasText: "MSFT" })).toContainText("cloud growth + margins");
    void errors;
  });

  test("a stop-loss reserves shares so they cannot be sold twice", async ({ page, errors }) => {
    let ticket = await openTicket(page, "NVDA");
    await ticket.getByLabel("Quantity").fill("5");
    await ticket.getByRole("button", { name: "Buy" }).click();
    await expect(page.getByText(/Bought 5 NVDA/)).toBeVisible();

    ticket = await openTicket(page, "NVDA", "Sell");
    await ticket.getByRole("tab", { name: "Stop" }).click();
    await ticket.getByLabel("Trigger price").fill("100");
    await ticket.getByLabel("Quantity").fill("5");
    await ticket.getByRole("button", { name: "Place stop sell" }).click();
    await expect(page.getByText("Stop sell placed: 5 NVDA @ $100.00")).toBeVisible();

    ticket = await openTicket(page, "NVDA", "Sell");
    await expect(ticket).toContainText("Available 0 sh");
    await expect(ticket.getByRole("button", { name: "Sell" })).toBeDisabled();
    void errors;
  });

  test("price alerts can be created, rejected when already met, listed and deleted", async ({ page, errors }) => {
    await row(page, "AAPL").hover();
    await page.getByRole("button", { name: "More actions for AAPL" }).click();
    await page.getByRole("menuitem", { name: "Create price alert" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Alert price").fill("180");
    await dialog.getByRole("button", { name: "Create alert" }).click();
    await expect(dialog.getByText(/already meets this condition/)).toBeVisible();

    await dialog.getByLabel("Alert price").fill("200");
    await dialog.getByLabel("Note (optional)").fill("breakout level");
    await dialog.getByRole("button", { name: "Create alert" }).click();
    await expect(page.getByText("Alert set for AAPL")).toBeVisible();

    await menu(page, "/alerts").click();
    const alertRow = page.locator(".order-table tbody tr", { hasText: "AAPL" });
    await expect(alertRow).toContainText("Notify when price rises to $200.00 or above");
    await expect(alertRow).toContainText("breakout level");

    await page.getByLabel("Symbol for new alert").fill("tsla");
    await page.getByRole("button", { name: "New alert" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Create alert · TSLA");
    await dialog.getByLabel("Notify me when").click();
    await page.getByRole("option", { name: "Day change is down at least" }).click();
    await dialog.getByLabel("Alert percent").fill("5");
    await dialog.getByRole("button", { name: "Create alert" }).click();
    await expect(page.locator(".order-table tbody tr", { hasText: "TSLA" })).toContainText("day change reaches -5% or worse");

    await alertRow.getByRole("button", { name: "Delete AAPL alert" }).click();
    await expect(page.locator(".order-table tbody tr", { hasText: "AAPL" })).toHaveCount(0);
    void errors;
  });

  test("notifications bell opens an empty state and the old Apps URL redirects", async ({ page, errors }) => {
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Nothing yet. Order fills and price alerts will appear here.")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(DASH + "/apps");
    await expect(page).toHaveURL(DASH + "/alerts");
    void errors;
  });

  test("stock detail offers buy, sell and alert actions", async ({ page, errors }) => {
    await row(page, "AMD").hover();
    await page.getByRole("button", { name: "Analytics for AMD" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Alert", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Create alert · AMD");
    void errors;
  });
});
