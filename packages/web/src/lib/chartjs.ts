import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Default theme colors
export const chartColors = {
  primary: '#6366f1', // indigo-500
  secondary: '#8b5cf6', // violet-500
  success: '#22c55e', // green-500
  warning: '#f59e0b', // amber-500
  danger: '#ef4444', // red-500
  info: '#0ea5e9', // sky-500
  muted: '#6b7280', // gray-500

  // For pie/doughnut charts
  palette: [
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f43f5e', // rose
    '#f59e0b', // amber
    '#22c55e', // green
    '#0ea5e9', // sky
    '#14b8a6', // teal
  ],
};

// Default dark theme options
export const darkThemeOptions: Partial<ChartOptions<'line'>> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#9ca3af', // gray-400
        font: {
          family: 'Inter, system-ui, sans-serif',
        },
      },
    },
    tooltip: {
      backgroundColor: '#1f2937', // gray-800
      titleColor: '#f9fafb', // gray-50
      bodyColor: '#d1d5db', // gray-300
      borderColor: '#374151', // gray-700
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: {
        color: '#374151', // gray-700
      },
      ticks: {
        color: '#9ca3af', // gray-400
      },
    },
    y: {
      grid: {
        color: '#374151', // gray-700
      },
      ticks: {
        color: '#9ca3af', // gray-400
      },
    },
  },
};

export default ChartJS;
