import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client", () => ({
  default: api,
  errorMessage: (err, fallback) => err?.response?.data?.error?.message || fallback || "error",
  newClientOrderId: () => "test-client-order-id",
}));
const notify = vi.fn();
vi.mock("../context/NotificationContext", () => ({ useNotify: () => notify }));
vi.mock("../context/MarketDataContext", () => ({
  useQuotes: () => ({ AAPL: { symbol: "AAPL", price: 100, status: "demo", changePct: 1 } }),
}));

import OrderWindow from "../components/OrderWindow";
import GeneralContext from "../components/GeneralContext";

const ctx = { closeOrderWindow: vi.fn(), portfolioChanged: vi.fn() };
const renderWindow = (side = "BUY") =>
  render(
    <GeneralContext.Provider value={ctx}>
      <OrderWindow symbol="AAPL" side={side} />
    </GeneralContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (path) =>
    path === "/funds" ? { data: { cash: 1000 } } : { data: { items: [{ symbol: "AAPL", qty: 3 }] } }
  );
});

describe("OrderWindow", () => {
  it("shows the estimated cost and validates quantity", async () => {
    const user = userEvent.setup();
    renderWindow();
    expect(await screen.findByText(/Available \$1,000.00/)).toBeInTheDocument();
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "0");
    expect(screen.getByRole("alert")).toHaveTextContent("whole number");
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    await user.clear(qty);
    await user.type(qty, "20");
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds your available cash");
    expect(screen.getByText(/Sample data/i)).toBeInTheDocument();
  });

  it("blocks selling more than held", async () => {
    const user = userEvent.setup();
    renderWindow("SELL");
    await screen.findByText(/Available 3 sh/);
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "4");
    expect(screen.getByRole("alert")).toHaveTextContent("You have 3 unreserved share(s) of AAPL");
  });

  it("submits once, then notifies and refreshes on server success", async () => {
    const user = userEvent.setup();
    let resolve;
    api.post.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderWindow();
    await screen.findByText(/Available/);
    const button = screen.getByRole("button", { name: "Buy" });
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Placing…" }));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/orders", { symbol: "AAPL", side: "BUY", type: "MARKET", qty: 1, clientOrderId: "test-client-order-id" });
    expect(notify).not.toHaveBeenCalled();
    resolve({ data: { order: { side: "BUY", qty: 1, symbol: "AAPL", price: 100 } } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Bought 1 AAPL at $100.00 (simulated)"));
    expect(ctx.portfolioChanged).toHaveBeenCalled();
    expect(ctx.closeOrderWindow).toHaveBeenCalled();
  });

  it("places a limit order with price, validity and journal note", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { order: { status: "OPEN", type: "LIMIT", side: "BUY", qty: 2, symbol: "AAPL", triggerPrice: 95 } } });
    renderWindow();
    await screen.findByText(/Available \$1,000.00/);
    await user.click(screen.getByRole("tab", { name: "Limit" }));
    const price = screen.getByLabelText("Limit price");
    expect(price).toHaveValue("100.00");
    await user.clear(price);
    await user.type(price, "95");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.click(screen.getByLabelText(/GTC/));
    await user.type(screen.getByLabelText("Journal note"), "buy the dip");
    expect(screen.getByText(/Reserves \$190.00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Place limit buy" }));
    expect(api.post).toHaveBeenCalledWith("/orders", {
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      qty: 2,
      price: 95,
      validity: "GTC",
      note: "buy the dip",
      clientOrderId: "test-client-order-id",
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Limit buy placed: 2 AAPL @ $95.00", "info"));
  });

  it("validates the limit price", async () => {
    const user = userEvent.setup();
    renderWindow();
    await screen.findByText(/Available/);
    await user.click(screen.getByRole("tab", { name: "Stop" }));
    const trigger = screen.getByLabelText("Trigger price");
    await user.clear(trigger);
    await user.type(trigger, "1.234");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a trigger price with at most 2 decimals.");
  });

  it("shows the server error and never reports success when the order fails", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({ response: { status: 422, data: { error: { message: "Not enough virtual cash for this order." } } } });
    renderWindow();
    await screen.findByText(/Available/);
    await user.click(screen.getByRole("button", { name: "Buy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not enough virtual cash");
    expect(notify).not.toHaveBeenCalled();
    expect(ctx.closeOrderWindow).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled();
  });
});
