/**
 * mori-backfill-dry-run · CLI entry (#148).
 *
 *   node mori-backfill-dry-run.mjs --snapshot <path-to-snapshot.sqlite>
 *
 * Prints one JSON object on stdout: the report, or `{ "error": { code, message } }`.
 * Exit 0 on a report, 1 on a refusal, 2 on bad usage. See docs/backfill-dry-run.md.
 */
import {
  DryRunError,
  nodeVersionSupported,
  runSnapshotDryRun,
} from "./snapshotDryRun";

declare const __MORI_TOOL_COMMIT__: string;
declare const __MORI_TOOL_DIRTY__: boolean;

const USAGE = "usage: node mori-backfill-dry-run.mjs --snapshot <path-to-snapshot.sqlite>";

function emit(value: unknown, code: number): never {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const at = argv.indexOf("--snapshot");
  const snapshotPath = at >= 0 ? argv[at + 1] : undefined;
  if (!snapshotPath || argv.length !== 2) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  if (!nodeVersionSupported(process.versions.node)) {
    emit({ error: { code: "NODE_TOO_OLD", message: new DryRunError("NODE_TOO_OLD").message } }, 1);
  }
  try {
    const report = await runSnapshotDryRun({
      snapshotPath,
      env: process.env,
      provenance: { sourceCommit: __MORI_TOOL_COMMIT__, sourceDirty: __MORI_TOOL_DIRTY__ },
    });
    emit(report, 0);
  } catch (error) {
    if (error instanceof DryRunError) emit({ error: { code: error.code, message: error.message } }, 1);
    // Anything else: the name only. A message could carry a path or row content.
    emit({ error: { code: "UNEXPECTED", message: error instanceof Error ? error.name : "unknown" } }, 1);
  }
}

void main(process.argv.slice(2));
