import { describe, expect, it } from "vitest";
import {
  classifyEndpointLocality,
  describeEndpointLocality,
  endpointLocalityLabel,
} from "./endpointLocality";

describe("classifyEndpointLocality", () => {
  it("treats loopback and localhost as local, with or without a scheme", () => {
    expect(classifyEndpointLocality("http://localhost:11434")).toBe("local");
    expect(classifyEndpointLocality("localhost:1234")).toBe("local");
    expect(classifyEndpointLocality("http://127.0.0.1:8080/v1")).toBe("local");
    expect(classifyEndpointLocality("http://[::1]:11434")).toBe("local");
    expect(classifyEndpointLocality("http://0.0.0.0:5000")).toBe("local");
  });

  it("treats private LAN ranges and .local mDNS names as local", () => {
    expect(classifyEndpointLocality("http://192.168.0.42:1234")).toBe("local");
    expect(classifyEndpointLocality("http://10.0.0.5:11434")).toBe("local");
    expect(classifyEndpointLocality("http://172.16.3.9:8000")).toBe("local");
    expect(classifyEndpointLocality("http://studio.local:1234")).toBe("local");
  });

  it("treats a public host as external", () => {
    expect(classifyEndpointLocality("https://api.openai.com/v1")).toBe("external");
    expect(classifyEndpointLocality("https://api.together.xyz")).toBe("external");
    // 172.x outside the private block is public.
    expect(classifyEndpointLocality("http://172.0.0.1:8080")).toBe("external");
  });

  it("is unknown for a blank or unparseable endpoint", () => {
    expect(classifyEndpointLocality("")).toBe("unknown");
    expect(classifyEndpointLocality(null)).toBe("unknown");
    expect(classifyEndpointLocality(undefined)).toBe("unknown");
    expect(classifyEndpointLocality("   ")).toBe("unknown");
  });
});

describe("describeEndpointLocality / endpointLocalityLabel", () => {
  it("maps each locality to a calm Korean label", () => {
    expect(describeEndpointLocality("local")).toBe("로컬 · 외부 전송 없음");
    expect(describeEndpointLocality("external")).toBe("외부 서버로 전송");
    expect(describeEndpointLocality("unknown")).toBe("엔드포인트 미설정");
  });

  it("classifies and labels in one call", () => {
    expect(endpointLocalityLabel("http://localhost:11434")).toBe("로컬 · 외부 전송 없음");
    expect(endpointLocalityLabel("https://api.openai.com")).toBe("외부 서버로 전송");
  });
});
