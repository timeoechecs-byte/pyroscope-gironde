/**
 * FWICurve — 30-day evolution chart for the six CFFWIS components.
 *
 * Affiche :
 * - FWI + ISI (barres + ligne)
 * - FFMC, DMC, DC (courbes auxiliaires)
 * - DSR (échelle secondaire)
 * - Classes EFFIS en bandes de fond
 *
 * Props : series[] avec {date, ffmc, dmc, dc, isi, bui, fwi, dsr, effis_class}
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface FWIDataPoint {
  date: string;
  ffmc?: number;
  dmc?: number;
  dc?: number;
  isi?: number;
  bui?: number;
  fwi?: number;
  dsr?: number;
  effis_class?: string;
}

interface FWICurveProps {
  series: FWIDataPoint[];
  height?: number;
}

// EFFIS class thresholds (FWI ranges)
const EFFIS_BANDS = [
  { max: 5.2, label: "Très faible", color: "#166534" },
  { max: 11.2, label: "Faible", color: "#a16207" },
  { max: 21.3, label: "Modéré", color: "#ea580c" },
  { max: 38.0, label: "Élevé", color: "#dc2626" },
  { max: 50.0, label: "Très élevé", color: "#991b1b" },
  { max: Infinity, label: "Extrême", color: "#450a0a" },
];

function getEffisColor(fwi: number): string {
  for (const band of EFFIS_BANDS) {
    if (fwi < band.max) return band.color;
  }
  return "#450a0a";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: Record<string, any>) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-md border border-border/50 bg-background/95 p-3 text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1 font-medium">{label}</p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>FFMC: {data.ffmc?.toFixed(1) ?? "—"}</p>
        <p>DMC: {data.dmc?.toFixed(1) ?? "—"}</p>
        <p>DC: {data.dc?.toFixed(1) ?? "—"}</p>
        <p>ISI: {data.isi?.toFixed(2) ?? "—"}</p>
        <p>BUI: {data.bui?.toFixed(1) ?? "—"}</p>
        <p className="font-semibold text-foreground">
          FWI: {data.fwi?.toFixed(1) ?? "—"}
        </p>
        <p>DSR: {data.dsr?.toFixed(3) ?? "—"}</p>
        <p
          className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: getEffisColor(data.fwi ?? 0) }}
        >
          {data.effis_class ?? "Inconnu"}
        </p>
      </div>
    </div>
  );
};

export default function FWICurve({ series, height = 250 }: FWICurveProps) {
  if (!series.length) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Aucune donnée FWI disponible — PHASE 2
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={series}
          margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />

          {/* EFFIS bandes de fond */}
          {EFFIS_BANDS.map((band) => (
            <ReferenceLine
              key={band.label}
              y={band.max === Infinity ? 60 : band.max}
              stroke={band.color}
              strokeOpacity={0.3}
              strokeDasharray="4 2"
              label={
                band.max < Infinity
                  ? {
                      value: band.max.toString(),
                      position: "right",
                      className: "text-[9px] fill-muted-foreground/50",
                    }
                  : undefined
              }
            />
          ))}

          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(val: string) => {
              const d = new Date(val);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
            className="text-muted-foreground/50"
          />

          <YAxis
            tick={{ fontSize: 10 }}
            className="text-muted-foreground/50"
            domain={[0, "auto"]}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* FWI main curve */}
          <Line
            type="monotone"
            dataKey="fwi"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#dc2626" }}
          />

          {/* ISI secondary */}
          <Line
            type="monotone"
            dataKey="isi"
            stroke="#f97316"
            strokeWidth={1}
            strokeDasharray="3 2"
            dot={false}
          />

          {/* FFMC (dashed, secondary axis) */}
          <Line
            type="monotone"
            dataKey="ffmc"
            stroke="#22c55e"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-red-600" /> FWI
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-b border-dashed border-orange-500" />{" "}
          ISI
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-b border-dotted border-green-500" />{" "}
          FFMC
        </span>
      </div>
    </div>
  );
}
