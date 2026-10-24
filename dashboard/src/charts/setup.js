import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { gridColor, surfaceColor, tickColor } from "./palette";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Title, Tooltip);

ChartJS.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = tickColor();
ChartJS.defaults.borderColor = gridColor();
ChartJS.defaults.animation = false;
ChartJS.defaults.maintainAspectRatio = false;
ChartJS.defaults.plugins.legend.labels.boxWidth = 12;
ChartJS.defaults.plugins.legend.labels.boxHeight = 2;
ChartJS.defaults.plugins.tooltip.backgroundColor = "rgba(49, 49, 49, 0.92)";
ChartJS.defaults.plugins.tooltip.padding = 8;
ChartJS.defaults.plugins.tooltip.cornerRadius = 2;
ChartJS.defaults.interaction.mode = "index";
ChartJS.defaults.interaction.intersect = false;

export const barStyle = { borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, borderWidth: 0 };
export const lineStyle = { borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, tension: 0.2 };
export const arcStyle = { get borderColor() { return surfaceColor(); }, borderWidth: 2, hoverOffset: 4 };

export const axis = (extra = {}) => ({ grid: { color: gridColor(), drawTicks: false }, border: { display: false }, ticks: { padding: 6 }, ...extra });

export default ChartJS;
