import React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketDataProvider, useMarketData, useQuotes } from "../context/MarketDataContext";

function createFakeSocket() {
  const handlers = {};
  const socket = {
    connected: false,
    emitted: [],
    on: vi.fn((ev, fn) => ((handlers[ev] ||= new Set()).add(fn))),
    off: vi.fn((ev, fn) => handlers[ev]?.delete(fn)),
    emit: vi.fn((ev, payload, ack) => socket.emitted.push({ ev, payload, ack })),
    disconnect: vi.fn(),
    fire(ev, payload) {
      handlers[ev]?.forEach((fn) => fn(payload));
    },
    listenerCount: () => Object.values(handlers).reduce((n, s) => n + s.size, 0),
  };
  return socket;
}

const Prices = ({ symbols }) => {
  const quotes = useQuotes(symbols);
  const { connection } = useMarketData();
  return (
    <div>
      <span data-testid="conn">{connection}</span>
      {symbols.map((s) => (
        <span key={s} data-testid={s}>
          {quotes[s]?.price ?? "none"}
        </span>
      ))}
    </div>
  );
};

describe("MarketDataProvider", () => {
  it("subscribes to the union of symbols, applies acks and pushed quotes, and cleans up", async () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();
    const { unmount } = render(
      <MarketDataProvider socketFactory={() => socket}>
        <Prices symbols={["AAPL", "MSFT"]} />
        <Prices symbols={["AAPL"]} />
      </MarketDataProvider>
    );
    expect(screen.getAllByTestId("conn")[0]).toHaveTextContent("connecting");

    socket.connected = true;
    act(() => socket.fire("connect"));
    act(() => vi.advanceTimersByTime(60));
    const sub = socket.emitted.findLast((e) => e.ev === "quotes:subscribe");
    expect(sub.payload.sort()).toEqual(["AAPL", "MSFT"]);

    act(() => sub.ack({ quotes: { AAPL: { symbol: "AAPL", price: 100 }, MSFT: { symbol: "MSFT", price: 200 } } }));
    expect(screen.getAllByTestId("AAPL")[0]).toHaveTextContent("100");
    expect(screen.getByTestId("MSFT")).toHaveTextContent("200");

    act(() => socket.fire("quote", { symbol: "AAPL", price: 101 }));
    screen.getAllByTestId("AAPL").forEach((el) => expect(el).toHaveTextContent("101"));

    act(() => socket.fire("disconnect"));
    expect(screen.getAllByTestId("conn")[0]).toHaveTextContent("disconnected");

    const before = socket.emitted.length;
    act(() => socket.fire("connect"));
    act(() => vi.advanceTimersByTime(60));
    expect(socket.emitted.length).toBe(before + 1);

    unmount();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.listenerCount()).toBe(0);
    vi.useRealTimers();
  });
});
