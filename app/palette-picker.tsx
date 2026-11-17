"use client";

/**
 * Colour palette switch for the More sheet. It only swaps the data-palette
 * attribute (see app/palettes.css) and remembers the choice on the device.
 */

import { useEffect, useState } from "react";

const PALETTE_KEY = "nsutnest-palette";

const PALETTES = [
  { key: "plum", label: "Plum", dot: "#ff9ecb" },
  { key: "emerald", label: "Emerald", dot: "#c7f36b" },
  { key: "ocean", label: "Ocean", dot: "#5eead4" },
  { key: "violet", label: "Violet", dot: "#b7a6ff" },
  { key: "mono", label: "Mono", dot: "#f2f2f3" },
];

export function PalettePicker() {
  const [active, setActive] = useState("plum");

  useEffect(() => {
    const stored = window.localStorage.getItem(PALETTE_KEY);
    if (stored && PALETTES.some((palette) => palette.key === stored)) setActive(stored);
  }, []);

  function choose(key: string) {
    document.documentElement.setAttribute("data-palette", key);
    try {
      window.localStorage.setItem(PALETTE_KEY, key);
    } catch {
      // Storage blocked: the palette still applies until this visit ends.
    }
    setActive(key);
  }

  return (
    <div className="paletteGrid" role="group" aria-label="Colour palette">
      {PALETTES.map((palette) => (
        <button
          className={`paletteChip ${active === palette.key ? "on" : ""}`.trim()}
          key={palette.key}
          type="button"
          aria-pressed={active === palette.key}
          onClick={() => choose(palette.key)}
        >
          <i style={{ background: palette.dot }} aria-hidden="true" />
          {palette.label}
        </button>
      ))}
    </div>
  );
}
