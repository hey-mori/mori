import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every command the TypeScript bridge can call must be registered in
 * `main.rs`.
 *
 * Nothing else checks this. `TauriCommandName` is a TypeScript union, the Rust
 * handler list is a macro invocation, and neither knows about the other, so a
 * bridge method added without its registration type-checks, builds, passes the
 * whole suite, and then fails at runtime on a desktop device with "command not
 * found". That is the one failure mode a unit test genuinely cannot reach by
 * calling the code, so it is checked by reading the two sources instead.
 *
 * The parses assert they found a plausible amount before comparing, so a change
 * to either file's formatting fails loudly rather than silently passing on an
 * empty set.
 */
const ROOT = join(__dirname, "..", "..", "..");

function declaredCommandNames(): string[] {
  const source = readFileSync(join(ROOT, "src", "lib", "desktop", "tauriCommands.ts"), "utf8");
  const start = source.indexOf("export type TauriCommandName =");
  const end = source.indexOf(";", start);
  expect(start, "TauriCommandName union not found").toBeGreaterThan(-1);
  const union = source.slice(start, end);
  return [...union.matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]);
}

function registeredCommandNames(): string[] {
  const source = readFileSync(join(ROOT, "src-tauri", "src", "main.rs"), "utf8");
  const start = source.indexOf("tauri::generate_handler![");
  const end = source.indexOf("]", start);
  expect(start, "generate_handler! not found").toBeGreaterThan(-1);
  const block = source.slice(start, end);
  // Entries are `module::command,` or a bare `command,`; only the last segment
  // is the name Tauri exposes to the frontend.
  return [...block.matchAll(/(?:[a-z_][a-z0-9_]*::)*([a-z_][a-z0-9_]*)\s*,/g)].map(
    (match) => match[1],
  );
}

describe("Tauri command registration", () => {
  it("registers every command the bridge declares", () => {
    const declared = declaredCommandNames();
    const registered = new Set(registeredCommandNames());

    expect(declared.length).toBeGreaterThan(50);
    expect(registered.size).toBeGreaterThan(50);

    const missing = declared.filter((name) => !registered.has(name));
    expect(missing, `declared in TypeScript but not registered in main.rs: ${missing.join(", ")}`)
      .toEqual([]);
  });
});
