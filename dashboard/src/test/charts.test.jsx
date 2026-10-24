import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SERIES, colorMap, foldOther, signColor, PROFIT, LOSS } from "../charts/palette";
import ChartCard from "../components/charts/ChartCard";
import RangeBar from "../components/charts/RangeBar";
import { ordersToCsv } from "../components/Orders";

describe("chart palette helpers", () => {
  it("keeps an entity's colour stable when values (and ranking) change", () => {
    const a = colorMap(["MSFT", "AAPL", "KO"]);
    const b = colorMap(["KO", "MSFT", "AAPL"]);
    expect(a).toEqual(b);
    expect(a.AAPL).toBe(SERIES[0]);
  });

  it("folds the long tail into Other instead of generating new hues", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ s: `S${i}`, v: 10 - i }));
    const folded = foldOther(items, { key: (i) => i.s, value: (i) => i.v, max: 7 });
    expect(folded).toHaveLength(8);
    expect(folded.at(-1)).toEqual({ label: "Other", value: 3 + 2 + 1, other: true });
    expect(foldOther(items.slice(0, 8), { key: (i) => i.s, value: (i) => i.v, max: 7 })).toHaveLength(8);
  });

  it("colours signed values by polarity", () => {
    expect(signColor(5)).toBe(PROFIT);
    expect(signColor(-1)).toBe(LOSS);
  });
});

describe("ChartCard", () => {
  it("switches between the chart and an accessible table", async () => {
    const user = userEvent.setup();
    render(
      <ChartCard title="Allocation" note="note" table={{ columns: ["Holding", "Value"], rows: [["AAPL", "$10.00"]] }}>
        <div>chart-canvas</div>
      </ChartCard>
    );
    expect(screen.getByText("chart-canvas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("cell", { name: "AAPL" })).toBeInTheDocument();
    expect(screen.queryByText("chart-canvas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an explanation instead of an empty chart", () => {
    render(
      <ChartCard title="P&L" empty="No holdings yet." table={{ columns: [], rows: [] }}>
        <div>chart-canvas</div>
      </ChartCard>
    );
    expect(screen.getByText("No holdings yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Table" })).not.toBeInTheDocument();
  });
});

describe("RangeBar", () => {
  it("describes the range in text and positions the marker", () => {
    const { container } = render(<RangeBar label="52-week range" low={100} high={200} current={150} />);
    expect(screen.getByText("50% of range")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/low 100.00, high 200.00, current 150.00/);
    expect(container.querySelector(".range-bar-marker").style.left).toBe("50%");
  });

  it("handles missing data", () => {
    render(<RangeBar label="Day range" low={null} high={null} current={10} />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });
});

describe("orders CSV export", () => {
  it("writes a header and escapes values", () => {
    const csv = ordersToCsv([
      { createdAt: "2026-10-23T13:00:00.000Z", filledAt: "2026-10-23T14:00:00.000Z", side: "BUY", type: "LIMIT", symbol: "BRK.B", qty: 2, price: 450.5, value: 901, realizedPnl: 0, priceSource: "rest", note: "" },
      { createdAt: "2026-10-23T15:00:00.000Z", side: "SELL", symbol: 'A"B,C', qty: 1, price: 1, value: 1, realizedPnl: -0.5, priceSource: "demo", note: "took profit, early" },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Time (UTC),Side,Type,Symbol,Qty,Fill price (USD),Value (USD),Realized P&L (USD),Price source,Note");
    expect(lines[1]).toBe("2026-10-23T14:00:00.000Z,BUY,LIMIT,BRK.B,2,450.5,901,0,rest,");
    expect(lines[2]).toContain(',MARKET,"A""B,C",');
    expect(lines[2]).toContain('"took profit, early"');
  });
});
