import { cn } from "@gateseeker/ui-kit";

/*
 * Decorative radar behind the Home hero. Its centre sits on the top edge of
 * the container (the bottom edge of the header), so only the lower half shows:
 * four rings fan out downwards from the header. Two opposite beams turn clockwise,
 * so one is always crossing the visible half. Pure CSS (web/src/index.css),
 * brand colour, no script; beams and blips stand still for visitors who ask
 * for reduced motion.
 *
 * Blips are placed by angle (clockwise from the top, so 90..270 is the visible
 * half) and distance from the centre. A beam reaches a given angle every half
 * turn; each blip's delay is the moment that happens.
 */

const TURN_SECONDS = 14;
const BEAM_SECONDS = TURN_SECONDS / 2;

const BLIPS: { angle: number; distance: number }[] = [
  { angle: 108, distance: 0.78 },
  { angle: 139, distance: 0.52 },
  { angle: 171, distance: 0.88 },
  { angle: 204, distance: 0.66 },
  { angle: 243, distance: 0.84 },
];

export function RadarBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("radar pointer-events-none absolute overflow-hidden", className)} aria-hidden="true">
      <div className="radar-dish">
        <div className="radar-rings" />
        <div className="radar-sweep" style={{ animationDuration: `${TURN_SECONDS}s` }} />
        {BLIPS.map((b) => {
          const rad = (b.angle * Math.PI) / 180;
          return (
            <span
              key={b.angle}
              className="radar-blip"
              style={{
                left: `${50 + Math.sin(rad) * b.distance * 50}%`,
                top: `${50 - Math.cos(rad) * b.distance * 50}%`,
                animationDuration: `${BEAM_SECONDS}s`,
                animationDelay: `${((b.angle / 360) * TURN_SECONDS) % BEAM_SECONDS}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
