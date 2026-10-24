import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import QuoteStatus from "../components/QuoteStatus";

describe("QuoteStatus", () => {
  it.each([
    ["live", "Live"],
    ["snapshot", "Snapshot"],
    ["closed", "Market closed"],
    ["stale", "Stale"],
    ["demo", "Sample data"],
    ["unavailable", "Unavailable"],
  ])("labels %s quotes", (status, label) => {
    render(<QuoteStatus quote={{ status, sourceTs: 1700000000000 }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("can hide selected statuses", () => {
    const { container } = render(<QuoteStatus quote={{ status: "demo" }} hide={["demo"]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
