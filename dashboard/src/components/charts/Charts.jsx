import React from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import "../../charts/setup";
import { arcStyle, axis, barStyle, lineStyle } from "../../charts/setup";
import { NEUTRAL, OTHER, colorMap, signColor } from "../../charts/palette";
import { formatMoney, formatPct } from "../../utils/format";

const money = (v) => formatMoney(v);

export function AllocationDoughnut({ items, neutral = ["Cash"], format = money }) {
  const colors = colorMap(items.filter((i) => !i.other && !neutral.includes(i.label)).map((i) => i.label));
  const total = items.reduce((s, i) => s + i.value, 0);
  const data = {
    labels: items.map((i) => i.label),
    datasets: [
      {
        data: items.map((i) => i.value),
        backgroundColor: items.map((i) => (i.other ? OTHER : neutral.includes(i.label) ? NEUTRAL : colors[i.label])),
        ...arcStyle,
      },
    ],
  };
  return (
    <Doughnut
      data={data}
      options={{
        cutout: "62%",
        interaction: { mode: "nearest", intersect: true },
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${format(ctx.parsed)} · ${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%`,
            },
          },
        },
      }}
    />
  );
}

export function SignedBar({ labels, values, format = money, horizontal = true, label = "Value" }) {
  const data = {
    labels,
    datasets: [{ label, data: values, backgroundColor: values.map(signColor), ...barStyle }],
  };
  const valueAxis = axis({ ticks: { callback: (v) => format(v) } });
  const catAxis = axis({ grid: { display: false } });
  return (
    <Bar
      data={data}
      options={{
        indexAxis: horizontal ? "y" : "x",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${format(horizontal ? ctx.parsed.x : ctx.parsed.y)}` } } },
        scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
      }}
    />
  );
}

export function GroupedBar({ labels, series, format = money, stacked = false }) {
  const data = {
    labels,
    datasets: series.map((s) => ({ label: s.label, data: s.values, backgroundColor: s.color, ...barStyle, borderSkipped: stacked ? false : "start" })),
  };
  return (
    <Bar
      data={data}
      options={{
        plugins: {
          legend: { position: "top", align: "end", labels: { boxHeight: 10, boxWidth: 10 } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${format(ctx.parsed.y)}` } },
        },
        scales: {
          x: axis({ grid: { display: false }, stacked }),
          y: axis({ stacked, ticks: { callback: (v) => format(v) } }),
        },
      }}
    />
  );
}

export function LineChart({ labels, series, format = money, stepped = false, fill = false }) {
  const data = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.values,
      borderColor: s.color,
      backgroundColor: fill ? `${s.color}1a` : s.color,
      fill: fill ? "origin" : false,
      stepped,
      ...lineStyle,
    })),
  };
  return (
    <Line
      data={data}
      options={{
        plugins: {
          legend: { display: series.length > 1, position: "top", align: "end" },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${format(ctx.parsed.y)}` } },
        },
        scales: {
          x: axis({ grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }),
          y: axis({ ticks: { callback: (v) => format(v) } }),
        },
      }}
    />
  );
}

export const pctFormat = (v) => formatPct(v);
