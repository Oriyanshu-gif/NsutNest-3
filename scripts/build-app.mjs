/**
 * Builds the bundled Android UI: a static export of the pages, with the server
 * API routes and the one legacy dynamic route moved aside (the app talks to the
 * deployed API over the network instead of running it on the device).
 */
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

const parked = [
  ["app/api", ".holdout-api"],
  ["app/notices/[id]", ".holdout-notice"],
];

const restore = () => {
  for (const [from, to] of parked) if (existsSync(to)) renameSync(to, from);
};

try {
  for (const [from, to] of parked) if (existsSync(from)) renameSync(from, to);
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, APP_EXPORT: "1", NEXT_PUBLIC_API_BASE: "https://www.nsutnest.xyz" },
  });
} finally {
  restore();
}
