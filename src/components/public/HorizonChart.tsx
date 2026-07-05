import { useId } from "react";
import type { NetWorthPoint } from "@/lib/finance/public";

/**
 * The public horizon chart: net worth over the whole plan, with the freedom point marked as a
 * small sunrise, the planned stop age as a dashed tick, and (off track) a depletion marker.
 *
 * Ported from the design references' `Horizon` component (resultat*.html) and generalized: the
 * references hand-picked the money axis (4/3/2 mio.) and the age ticks for their fixtures; here
 * both scales derive from the real `PublicResult.netWorthByAge` series. Geometry, colors and
 * marker styling are kept identical to the reference.
 */

export interface HorizonChartProps {
  /** Net worth per age, in kroner (PublicResult.netWorthByAge). */
  points: NetWorthPoint[];
  /** Frihedspunkt (sunrise marker), or null to omit (off track). */
  freedomAge: number | null;
  /** Planned stop age (dashed tick). */
  planAge: number | null;
  /** When the freedom point coincides with the plan, hide the duplicate plan label + stem. */
  freedomOnPlan?: boolean;
  /** Depletion marker ("Pengene slipper op, {age}"), off-track only. */
  depletion?: { age: number; label: string } | null;
  ariaLabel: string;
}

const W = 900;
const H = 364;
const padL = 80;
const padR = 30;
const padT = 26;
const padB = 48;

/** Money axis max in millions: the next whole million above the peak, with breathing room. */
function moneyAxisMax(peakM: number): number {
  const ceil = Math.max(1, Math.ceil(peakM));
  return peakM > ceil - 0.05 ? ceil + 1 : ceil;
}

/** Sparse age ticks: first ("I dag"), last (horizon end), and calm interior ticks. */
function ageTicks(first: number, last: number): number[] {
  const span = last - first;
  const ticks: number[] = [first];
  for (let a = first + 3; a <= last - 3; a++) {
    if (span >= 40 ? a % 10 === 5 : a % 5 === 0) ticks.push(a);
  }
  ticks.push(last);
  return ticks;
}

export function HorizonChart({ points, freedomAge, planAge, freedomOnPlan = false, depletion = null, ariaLabel }: HorizonChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (points.length < 2) return null;

  const data = points.map((p) => ({ age: p.age, value: p.netWorth / 1_000_000 }));
  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;
  const peak = Math.max(...data.map((d) => d.value));
  const axisMax = moneyAxisMax(peak);

  const x = (age: number) => padL + ((age - minAge) / Math.max(1, maxAge - minAge)) * (W - padL - padR);
  const y = (v: number) => H - padB - (v / axisMax) * (H - padT - padB);

  const pts = data.map((d) => `${x(d.age).toFixed(1)},${y(d.value).toFixed(1)}`);
  const linePath = "M" + pts.join(" L");
  const areaPath =
    `M${x(minAge).toFixed(1)},${y(data[0].value).toFixed(1)} L` +
    pts.slice(1).join(" L") +
    ` L${x(maxAge).toFixed(1)},${(H - padB).toFixed(1)} L${x(minAge).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  const valueAt = (age: number): number => {
    if (age <= data[0].age) return data[0].value;
    if (age >= data[data.length - 1].age) return data[data.length - 1].value;
    for (let i = 1; i < data.length; i++) {
      if (age <= data[i].age) {
        const a = data[i - 1];
        const b = data[i];
        return a.value + ((age - a.age) / (b.age - a.age)) * (b.value - a.value);
      }
    }
    return data[data.length - 1].value;
  };

  const moneyStep = Math.max(1, Math.ceil(axisMax / 4));
  const moneyTicks: number[] = [];
  for (let t = 0; t <= axisMax; t += moneyStep) moneyTicks.push(t);
  const ages = ageTicks(minAge, maxAge);
  const ageLabel = (a: number) => (a === minAge ? `I dag (${a})` : String(a));

  const boundedPlanAge = planAge != null && planAge >= minAge && planAge <= maxAge ? planAge : null;
  const boundedFreedomAge = freedomAge != null && freedomAge >= minAge && freedomAge <= maxAge ? freedomAge : null;
  const boundedDepletion = depletion != null && depletion.age >= minAge && depletion.age <= maxAge ? depletion : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--fjord)" stopOpacity="0.13" />
          <stop offset="1" stopColor="var(--fjord)" stopOpacity="0.01" />
        </linearGradient>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--dawn)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--dawn)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* money scale: faint gridlines + labels */}
      {moneyTicks.map((t) => (
        <g key={`m${t}`}>
          <line
            x1={padL}
            y1={y(t)}
            x2={W - padR}
            y2={y(t)}
            stroke="var(--brand-border)"
            strokeWidth={t === 0 ? 1.5 : 1}
            opacity={t === 0 ? 1 : 0.6}
          />
          <text
            x={padL - 12}
            y={y(t) + 4}
            textAnchor="end"
            fontFamily='"Public Sans", system-ui, sans-serif'
            fontSize="12"
            fontWeight="500"
            fill="var(--ink-soft)"
          >
            {t === 0 ? "0 kr" : `${t} mio. kr`}
          </text>
        </g>
      ))}

      <path d={areaPath} fill={`url(#fill-${uid})`} />

      {boundedPlanAge != null && (
        <g>
          <line
            x1={x(boundedPlanAge)}
            y1={H - padB}
            x2={x(boundedPlanAge)}
            y2={y(valueAt(boundedPlanAge)) - 4}
            stroke="var(--ink-soft)"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity="0.5"
          />
          {!freedomOnPlan && (
            <text
              x={x(boundedPlanAge) + 8}
              y={y(valueAt(boundedPlanAge)) + 4}
              fontFamily='"Public Sans", system-ui, sans-serif'
              fontSize="12"
              fontWeight="500"
              fill="var(--ink-soft)"
            >
              Din plan {boundedPlanAge}
            </text>
          )}
        </g>
      )}

      <path
        className="fm-hz-line"
        d={linePath}
        fill="none"
        stroke="var(--fjord)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {boundedFreedomAge != null && (
        <g>
          {!freedomOnPlan && (
            <line
              x1={x(boundedFreedomAge)}
              y1={H - padB}
              x2={x(boundedFreedomAge)}
              y2={y(valueAt(boundedFreedomAge))}
              stroke="var(--dawn)"
              strokeWidth="1.5"
            />
          )}
          <circle cx={x(boundedFreedomAge)} cy={y(valueAt(boundedFreedomAge))} r="22" fill={`url(#glow-${uid})`} />
          <circle cx={x(boundedFreedomAge)} cy={y(valueAt(boundedFreedomAge))} r="7" fill="var(--dawn)" />
          <circle cx={x(boundedFreedomAge)} cy={y(valueAt(boundedFreedomAge))} r="7" fill="none" stroke="var(--paper)" strokeWidth="2" />
          <text
            x={x(boundedFreedomAge)}
            y={y(valueAt(boundedFreedomAge)) - 21}
            textAnchor="middle"
            fontFamily='"Public Sans", system-ui, sans-serif'
            fontSize="13"
            fontWeight="600"
            fill="var(--dawn-deep)"
          >
            Frihedspunkt {boundedFreedomAge}
          </text>
        </g>
      )}

      {/* depletion marker: where the money runs out */}
      {boundedDepletion != null && (
        <g>
          <circle cx={x(boundedDepletion.age)} cy={y(valueAt(boundedDepletion.age))} r="6" fill="var(--clay)" />
          <circle
            cx={x(boundedDepletion.age)}
            cy={y(valueAt(boundedDepletion.age))}
            r="6"
            fill="none"
            stroke="var(--paper)"
            strokeWidth="2"
          />
          <text
            x={x(boundedDepletion.age)}
            y={y(valueAt(boundedDepletion.age)) - 16}
            textAnchor="middle"
            fontFamily='"Public Sans", system-ui, sans-serif'
            fontSize="13"
            fontWeight="600"
            fill="var(--clay)"
          >
            {boundedDepletion.label}
          </text>
        </g>
      )}

      {/* age scale */}
      {ages.map((a, i) => (
        <text
          key={`a${a}`}
          x={x(a)}
          y={H - padB + 24}
          textAnchor={i === 0 ? "start" : i === ages.length - 1 ? "end" : "middle"}
          fontFamily='"Public Sans", system-ui, sans-serif'
          fontSize="12"
          fontWeight="500"
          fill="var(--ink-soft)"
        >
          {ageLabel(a)}
        </text>
      ))}
    </svg>
  );
}
