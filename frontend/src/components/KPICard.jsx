import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function KPICard({ title, value, change, changeLabel, icon, iconBg, trend = 'neutral' }) {
  const trendIcons = {
    up: <TrendingUp className="w-4 h-4" />,
    down: <TrendingDown className="w-4 h-4" />,
    neutral: <Minus className="w-4 h-4" />
  };

  const trendColors = {
    up: 'text-green-600 bg-green-50',
    down: 'text-red-600 bg-red-50',
    neutral: 'text-gray-600 bg-gray-50'
  };

  const trendDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-unal-secondary-light">{title}</p>
          <p className="mt-2 text-2xl font-bold text-unal-secondary">{value}</p>
          {change !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${trendColors[trendDirection]}`}>
                {trendIcons[trendDirection]}
                {Math.abs(change)}% {changeLabel}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}