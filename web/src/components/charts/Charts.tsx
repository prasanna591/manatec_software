import { memo } from 'react';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  width?: string | number;
  showValues?: boolean;
  animate?: boolean;
}

const BAR_COLORS = [
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
  '#a0d911',
  '#2f54eb',
];

export const BarChart = memo(function BarChart({
  data,
  height = 240,
  width = '100%',
  showValues = true,
  animate = true,
}: BarChartProps) {
  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = 40;
  const gap = 28;
  const totalWidth = data.length * (barWidth + gap);
  const svgWidth = typeof width === 'number' ? width : Math.max(totalWidth, 400);
  const leftPad = 48;
  const rightPad = 24;
  const bottomPad = 40;
  const topPad = 24;
  const chartHeight = height - topPad - bottomPad;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={svgWidth + leftPad + rightPad}
        height={height}
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`Bar chart with ${data.length} data points`}
      >
        <defs>
          <linearGradient id="barGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="barGradientSuccess" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="barGradientWarning" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-warning)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-warning)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="barGradientDanger" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-danger)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-danger)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        
        {/* Y axis */}
        <line
          x1={leftPad}
          y1={topPad}
          x2={leftPad}
          y2={height - bottomPad}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {/* X axis */}
        <line
          x1={leftPad}
          y1={height - bottomPad}
          x2={svgWidth + leftPad}
          y2={height - bottomPad}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(frac => (
          <line
            key={frac}
            x1={leftPad}
            y1={topPad + chartHeight * (1 - frac)}
            x2={svgWidth + leftPad}
            y2={topPad + chartHeight * (1 - frac)}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ))}
        {/* Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <text
            key={frac}
            x={leftPad - 12}
            y={topPad + chartHeight * (1 - frac) + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--color-text-muted)"
            fontFamily="var(--font-mono)"
          >
            {Math.round(max * frac).toLocaleString()}
          </text>
        ))}
        {data.map((d, i) => {
          const barHeight = (d.value / max) * chartHeight;
          const x = leftPad + i * (barWidth + gap) + gap / 2;
          const y = height - bottomPad - barHeight;
          const colorIndex = i % BAR_COLORS.length;
          const gradients = [
            'url(#barGradient)',
            'url(#barGradientSuccess)',
            'url(#barGradientWarning)',
            'url(#barGradientDanger)',
          ];
          const fill = d.color 
            ? d.color 
            : gradients[colorIndex % gradients.length] || BAR_COLORS[colorIndex];

          return (
            <g key={i} style={{ cursor: 'default' }}>
              <rect
                x={x}
                y={animate ? height - bottomPad : y}
                width={barWidth}
                height={animate ? 0 : barHeight}
                fill={fill}
                rx={4}
                style={{
                  transition: animate ? 'y 0.6s cubic-bezier(0.16, 1, 0.3, 1), height 0.6s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                  transitionDelay: `${i * 80}ms`,
                }}
              />
              {showValues && (
                <text
                  x={x + barWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-text-primary)"
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  style={{ opacity: animate ? 0 : 1, transition: `opacity 0.3s ease ${0.4 + i * 0.08}s` }}
                >
                  {d.value.toLocaleString()}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={height - bottomPad + 22}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-text-muted)"
                fontFamily="var(--font-sans)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  animate?: boolean;
}

export const DonutChart = memo(function DonutChart({
  data,
  size = 240,
  thickness = 16,
  showLegend = true,
  animate = true,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - thickness - 8;
  const center = size / 2;
  
  const slices = data.reduce((acc, d, i) => {
    const sliceAngle = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const start = acc.cumulative;
    const end = start + sliceAngle;
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    
    const dashArray = 2 * Math.PI * radius;
    const dashOffset = animate ? dashArray - (d.value / total) * dashArray : 0;
    
    return {
      cumulative: end,
      paths: [
        ...acc.paths,
        <path
          key={i}
          d={path}
          fill={d.color}
          strokeWidth={0}
          style={{
            strokeDasharray: dashArray,
            strokeDashoffset: dashOffset,
            transition: animate ? 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            transitionDelay: `${i * 120}ms`,
          }}
        />
      ],
    };
  }, { cumulative: -Math.PI / 2, paths: [] as React.ReactElement[] }).paths;

  const centerValue = total.toLocaleString();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart showing ${data.length} categories, total ${total}`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={thickness}
        />
        {slices}
        <circle
          cx={center}
          cy={center}
          r={radius - thickness / 2}
          fill="var(--color-bg-elevated)"
        />
      </svg>
      {showLegend && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px 24px',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}
          role="list"
          aria-label="Chart legend"
        >
          {data.map((d, i) => (
            <div
              key={d.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-sans)',
              }}
              role="listitem"
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: d.color,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              <span>{d.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

interface LineChartProps {
  data: { x: string; y: number }[];
  height?: number;
  width?: string | number;
  color?: string;
  showPoints?: boolean;
  showArea?: boolean;
  animate?: boolean;
}

export const LineChart = memo(function LineChart({
  data,
  height = 240,
  width = '100%',
  color = 'var(--color-accent)',
  showPoints = true,
  showArea = true,
  animate = true,
}: LineChartProps) {
  const maxY = Math.max(...data.map(d => d.y), 1);
  const minY = Math.min(...data.map(d => d.y), 0);
  const rangeY = maxY - minY || 1;
  const svgWidth = typeof width === 'number' ? width : 600;
  const leftPad = 48;
  const rightPad = 24;
  const topPad = 24;
  const bottomPad = 40;
  const chartWidth = svgWidth - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;
  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = leftPad + i * stepX;
    const y = topPad + chartHeight - ((d.y - minY) / rangeY) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = [
    ...points.split(' '),
    `${leftPad + (data.length - 1) * stepX},${topPad + chartHeight}`,
    `${leftPad},${topPad + chartHeight}`,
  ].join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={svgWidth + rightPad}
        height={height}
        viewBox={`0 0 ${svgWidth + rightPad} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Line chart with ${data.length} data points, range ${minY} to ${maxY}`}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(frac => (
          <line
            key={frac}
            x1={leftPad}
            y1={topPad + chartHeight * frac}
            x2={leftPad + chartWidth}
            y2={topPad + chartHeight * frac}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ))}

        {/* Axes */}
        <line
          x1={leftPad}
          y1={topPad}
          x2={leftPad}
          y2={topPad + chartHeight}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <line
          x1={leftPad}
          y1={topPad + chartHeight}
          x2={leftPad + chartWidth}
          y2={topPad + chartHeight}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <text
            key={frac}
            x={leftPad - 12}
            y={topPad + chartHeight * (1 - frac) + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--color-text-muted)"
            fontFamily="var(--font-mono)"
          >
            {Math.round(minY + rangeY * (1 - frac))}
          </text>
        ))}

        {/* Area */}
        {showArea && (
          <path
            d={`M ${areaPoints} Z`}
            fill="url(#areaGradient)"
            style={{
              transformOrigin: `${leftPad}px ${topPad + chartHeight}px`,
              transform: animate ? 'scaleY(0)' : 'scaleY(1)',
              transformOrigin: 'bottom',
              transition: animate ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            }}
          />
        )}

        {/* Line */}
        <polyline
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth={2.5}
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: animate ? '1000' : 'none',
            strokeDashoffset: animate ? '1000' : '0',
            transition: animate ? 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          }}
        />

        {/* Points */}
        {showPoints && data.map((d, i) => {
          const x = leftPad + i * stepX;
          const y = topPad + chartHeight - ((d.y - minY) / rangeY) * chartHeight;
          return (
            <g key={i} style={{ cursor: 'default' }}>
              <circle
                cx={x}
                cy={y}
                r={animate ? 0 : 5}
                fill="var(--color-bg-elevated)"
                stroke={color}
                strokeWidth={2.5}
                style={{
                  transition: animate ? 'r 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                  transitionDelay: `${0.6 + i * 80}ms`,
                }}
              />
              <text
                x={x}
                y={topPad + chartHeight + 22}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-text-muted)"
                fontFamily="var(--font-sans)"
              >
                {d.x}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline = memo(function Sparkline({
  data,
  color = 'var(--color-accent)',
  width = 120,
  height = 40,
}: SparklineProps) {
  if (data.length < 2) return null;

  const maxY = Math.max(...data);
  const minY = Math.min(...data);
  const rangeY = maxY - minY || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d - minY) / rangeY) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M ${points} L ${width} ${height} L 0 ${height} Z`}
        fill="url(#sparklineGradient)"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(data.length - 1) * stepX}
        cy={height - ((data[data.length - 1] - minY) / rangeY) * height}
        r={3}
        fill={color}
      />
    </svg>
  );
});