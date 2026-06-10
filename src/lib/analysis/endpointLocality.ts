/**
 * Endpoint locality — derive whether an analysis engine's endpoint is local
 * (no public egress) or external, from its URL.
 *
 * Mori categorises analysis engines by *protocol* (규칙 기반 / Ollama / OpenAI
 * 호환), never by location, because location is not a property of the protocol:
 * an OpenAI-compatible endpoint can be a local server (LM Studio, llama.cpp,
 * vLLM, Ollama's own OpenAI-compat port) or a remote API. So "is my data leaving
 * the machine?" is answered here, from the configured endpoint, and surfaced as
 * a calm badge next to whichever engine is selected — not baked into the
 * engine's name. One pure function serves every present and future protocol.
 *
 * Pure and synchronous: no IO, no network probe. It only reads the URL the user
 * configured. An unreachable-but-local endpoint still reads as local.
 */
export type EndpointLocality = "local" | "external" | "unknown";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"]);

/**
 * Classify an endpoint URL as local, external, or unknown. Loopback, link-local
 * `.local` mDNS names, and private LAN ranges (10/8, 172.16/12, 192.168/16)
 * count as local — they do not send data to a public server. A blank or
 * unparseable endpoint is `unknown` so the caller can stay honest rather than
 * guess "local".
 */
export function classifyEndpointLocality(endpoint: string | null | undefined): EndpointLocality {
  const host = extractHost(endpoint);
  if (host === null) return "unknown";
  if (LOCAL_HOSTNAMES.has(host) || host.endsWith(".local")) return "local";
  if (isPrivateLanHost(host)) return "local";
  return "external";
}

/** Korean, copy-diet locality label for the badge. */
export function describeEndpointLocality(locality: EndpointLocality): string {
  switch (locality) {
    case "local":
      return "로컬 · 외부 전송 없음";
    case "external":
      return "외부 서버로 전송";
    default:
      return "엔드포인트 미설정";
  }
}

/** Convenience: classify and label an endpoint in one call. */
export function endpointLocalityLabel(endpoint: string | null | undefined): string {
  return describeEndpointLocality(classifyEndpointLocality(endpoint));
}

function extractHost(endpoint: string | null | undefined): string | null {
  const raw = (endpoint ?? "").trim();
  if (!raw) return null;
  // Accept endpoints written with or without a scheme (localhost:11434).
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  // URL keeps IPv6 hosts bracketed ("[::1]"); normalise to the bare address.
  const unbracketed = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return unbracketed.toLowerCase();
}

function isPrivateLanHost(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const [a, b] = octets.map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}
