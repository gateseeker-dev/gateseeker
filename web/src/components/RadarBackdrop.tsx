import { cn } from "@gateseeker/ui-kit";

/*
 * Decorative radar behind the Home hero: concentric rings, a crosshair, a
 * slow sweep and a few blips that light up as the sweep passes. Pure CSS
 * (web/src/index.css), brand colour, no script; the sweep and the blips stand
 * still for visitors who ask for reduced motion. Blips are placed by angle
 * (clockwise from the top) and distance from the centre, and their delay is
 * the moment the sweep reaches that angle.
 */

const SWEEP_SECONDS = 9;

const BLIPS: { angle: number; distance: number }[] = [
  { angle: 38, distance: 0.62 },
  { angle: 112, distance: 0.84 },
  { angle: 205, distance: 0.7 },
  { angle: 251, distance: 0.46 },
  { angle: 318, distance: 0.9 },
];

export function RadarBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("radar pointer-events-none absolute overflow-hidden", className)} aria-hidden="true">
      <div className="radar-dish">
        <div className="radar-rings" />
        <div className="radar-sweep" style={{ animationDuration: `${SWEEP_SECONDS}s` }} />
        {BLIPS.map((b) => {
          const rad = (b.angle * Math.PI) / 180;
          return (
            <span
              key={b.angle}
              className="radar-blip"
              style={{
                left: `${50 + Math.sin(rad) * b.distance * 50}%`,
                top: `${50 - Math.cos(rad) * b.distance * 50}%`,
                animationDuration: `${SWEEP_SECONDS}s`,
                animationDelay: `${(b.angle / 360) * SWEEP_SECONDS}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
