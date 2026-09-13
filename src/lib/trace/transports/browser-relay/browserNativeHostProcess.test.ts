import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { endianness, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { acknowledgeBrowserObservationRelayRequest } from "./browserObservationRelay";

const runProcessHarness = process.env.MORI_RUN_NATIVE_HOST_PROCESS_TEST === "1";
const describeProcessHarness = runProcessHarness ? describe : describe.skip;

describeProcessHarness("mori-browser-native-host process relay", () => {
  it("relays a Native Messaging frame to a Mori-side IPC endpoint that uses Browser ingress", async () => {
    if (platform() !== "win32") {
      throw new Error("The process harness currently verifies the Windows named pipe path.");
    }

    const hostPath = nativeHostPath();
    expect(existsSync(hostPath)).toBe(true);

    const relayName = `mori-browser-process-${process.pid}-${Date.now()}`;
    const pipePath = `\\\\.\\pipe\\${relayName}`;
    const observation = fixture("tab-activated.v1.json");
    const received = new Promise<unknown>((resolve, reject) => {
      let relayedObservation: unknown = null;
      const server = net.createServer((socket) => {
        let buffer = "";
        socket.setEncoding("utf8");
        socket.on("data", async (chunk) => {
          buffer += chunk;
          const newline = buffer.indexOf("\n");
          if (newline < 0) return;

          const line = buffer.slice(0, newline);
          const request = JSON.parse(line) as { observation: unknown };
          relayedObservation = request.observation;
          const ack = await acknowledgeBrowserObservationRelayRequest({
            requestId: "process-harness",
            observation: request.observation,
          }, async () => undefined);
          socket.end(`${JSON.stringify(ack.acknowledgement)}\n`);
          server.close();
        });
        socket.on("error", reject);
      });
      server.on("error", reject);
      server.listen(pipePath, () => {
        const child = spawn(hostPath, {
          env: { ...process.env, MORI_BROWSER_RELAY_NAME: relayName },
          stdio: ["pipe", "pipe", "pipe"],
        });

        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          try {
            expect(code).toBe(0);
            const ack = decodeNativeFrame(Buffer.concat(stdout));
            expect(ack).toEqual({
              ok: true,
              kind: "tab_activated",
              route: "trace",
            });
            resolve(relayedObservation);
          } catch (error) {
            reject(
              new Error(
                `${error instanceof Error ? error.message : String(error)}\nstderr: ${Buffer.concat(stderr).toString("utf8")}`,
              ),
            );
          }
        });

        child.stdin.write(encodeNativeFrame(observation));
        child.stdin.end();
      });
    });

    await expect(received).resolves.toMatchObject({
      version: 1,
      source: "browser",
      kind: "tab_activated",
    });
  }, 10_000);
});

function nativeHostPath(): string {
  const exe = platform() === "win32" ? ".exe" : "";
  const target = process.env.CARGO_BUILD_TARGET;
  if (target) {
    return join(
      process.cwd(),
      "src-tauri",
      "target",
      target,
      "debug",
      `mori-browser-native-host${exe}`,
    );
  }
  return join(process.cwd(), "src-tauri", "target", "debug", `mori-browser-native-host${exe}`);
}

function fixture(fileName: string): unknown {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "lib", "trace", "sources", "browser", "fixtures", fileName),
      "utf8",
    ),
  );
}

function encodeNativeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  if (endianness() === "LE") {
    header.writeUInt32LE(body.byteLength, 0);
  } else {
    header.writeUInt32BE(body.byteLength, 0);
  }
  return Buffer.concat([header, body]);
}

function decodeNativeFrame(buffer: Buffer): unknown {
  const length = endianness() === "LE" ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
  return JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")) as unknown;
}
