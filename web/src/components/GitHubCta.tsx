import { buttonVariants, cn } from "@gateseeker/ui-kit";
import { Star } from "lucide-react";

import { Link } from "../router";
import { GitHubMark } from "./GitHubMark";

export const REPOSITORY_URL = "https://github.com/gateseeker-dev/gateseeker";

/*
 * The star count is shown only from this number up: a small count next to the
 * call to action reads as a lack of users. Nothing fetches the count yet;
 * pass `stars` when a source for it exists.
 */
export const MIN_STARS_SHOWN = 100;

/** Call to action that opens the repository on GitHub: "Try open source" (hero) or "GitHub" (compact, header). */
export function GitHubCta({ stars, compact, className }: { stars?: number; compact?: boolean; className?: string }) {
  const showStars = typeof stars === "number" && stars >= MIN_STARS_SHOWN;
  return (
    <Link href={REPOSITORY_URL} className={cn(buttonVariants({ size: compact ? "sm" : "lg", variant: "outline" }), !compact && "h-11 px-6 text-base", className)}>
      <GitHubMark />
      {compact ? "GitHub" : "Try open source"}
      {showStars && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star className="fill-warning text-warning" aria-hidden="true" />
          {new Intl.NumberFormat("en-US").format(stars)}
        </span>
      )}
    </Link>
  );
}
