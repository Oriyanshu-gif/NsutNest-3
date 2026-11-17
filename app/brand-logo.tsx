import type { CSSProperties } from "react";

type BrandLogoProps = {
  compact?: boolean;
};

/**
 * NSUT Nest mark: a rounded badge carrying a geometric "N" sitting in a nest
 * curve. Shapes only — the badge and glyph colours come from the active palette
 * (see .nsutNestMark in home.css), so the logo never fights the palette.
 */
export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className={`nsutNestBrand${compact ? " compact" : ""}`}>
      <svg
        className="nsutNestMark"
        viewBox="0 0 48 48"
        role="img"
        aria-label="NSUT Nest"
        focusable="false"
        style={{ "--mark-size": compact ? "32px" : "38px" } as CSSProperties}
      >
        <rect className="markBadge" x="1" y="1" width="46" height="46" rx="13" />
        <path className="markGlyph" d="M16 30.5V17l16 13.5V17" />
        <path className="markNest" d="M13 35c4 3 18 3 22 0" />
      </svg>
      <span className="nsutNestWordmark">
        <b>Nsut<span>Nest</span></b>
        {!compact && <small>Campus portal</small>}
      </span>
    </span>
  );
}
