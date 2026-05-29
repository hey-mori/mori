/**
 * Work graph topology — a pure derivation of nodes + links.
 *
 * An Obsidian-style "graph view" of the user's work: a central hub, one node
 * per project, and the project's recent sessions linked to it. This module is
 * pure and deterministic — it builds the *topology* (which nodes exist, how
 * they link, how big they are, and a stable seed position) but does NOT run the
 * physics. The view layer relaxes the seed with a force simulation, so the
 * layout animates without this module touching a clock or random source.
 *
 * Seeds are normalised to the unit square (0..1, centre 0.5/0.5) so the view
 * can map them onto any canvas size. Link `distance` is a fraction of the
 * canvas's smaller side, i.e. the desired edge length once relaxed.
 */

export type WorkGraphSession = {
  sessionId: string;
  title: string;
};

export type WorkGraphProject = {
  key: string;
  label: string;
  sessions: WorkGraphSession[];
};

export type WorkGraphNodeKind = "hub" | "project" | "session";

export type WorkGraphNode = {
  id: string;
  kind: WorkGraphNodeKind;
  label: string;
  /** Base radius in px (node size is constant across zoom). */
  r: number;
  /** Normalised seed position in the unit square (0..1). */
  seedX: number;
  seedY: number;
  /** Project a node belongs to — set on project + session nodes. */
  projectKey?: string;
  /** Session id (session nodes only) — the click target. */
  sessionId?: string;
  /** Session count (project nodes only) — drives radius + a count label. */
  count?: number;
};

export type WorkGraphLink = {
  id: string;
  source: string;
  target: string;
  /** Hub→project spoke (true) vs project→session twig (false). */
  spoke: boolean;
  /** Desired relaxed length as a fraction of the canvas's smaller side. */
  distance: number;
};

export type WorkGraph = {
  nodes: WorkGraphNode[];
  links: WorkGraphLink[];
};

export type BuildWorkGraphOptions = {
  /** Cap the sessions plotted per project so dense projects stay legible. */
  maxSessionsPerProject?: number;
};

const DEG = Math.PI / 180;
const SPOKE_DISTANCE = 0.26;
const TWIG_DISTANCE = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build the work-graph topology. Projects seed on a ring around the hub; each
 * project's sessions seed on a short arc along the project's outward radial.
 * Returns just the hub when there are no projects.
 */
export function buildWorkGraph(
  projects: WorkGraphProject[],
  options: BuildWorkGraphOptions = {},
): WorkGraph {
  const maxSessions = options.maxSessionsPerProject ?? 8;

  const nodes: WorkGraphNode[] = [
    { id: "hub", kind: "hub", label: "", r: 11, seedX: 0.5, seedY: 0.5 },
  ];
  const links: WorkGraphLink[] = [];

  const count = projects.length;
  if (count === 0) return { nodes, links };

  const projectRing = count <= 2 ? 0.18 : 0.26;
  const sessionRing = 0.13;

  projects.forEach((project, index) => {
    const baseDeg = -90 + (360 / count) * index;
    const baseRad = baseDeg * DEG;
    const px = 0.5 + projectRing * Math.cos(baseRad);
    const py = 0.5 + projectRing * Math.sin(baseRad);
    const projectR = clamp(13 + project.sessions.length * 1.6, 13, 26);
    const projectId = `proj:${project.key}`;

    nodes.push({
      id: projectId,
      kind: "project",
      label: project.label,
      r: projectR,
      seedX: px,
      seedY: py,
      projectKey: project.key,
      count: project.sessions.length,
    });
    links.push({
      id: `spoke:${project.key}`,
      source: "hub",
      target: projectId,
      spoke: true,
      distance: SPOKE_DISTANCE,
    });

    const shown = project.sessions.slice(0, maxSessions);
    const m = shown.length;
    const arcDeg = m <= 1 ? 0 : Math.min(150, 26 * (m - 1));
    shown.forEach((session, j) => {
      const offset = m <= 1 ? 0 : (j - (m - 1) / 2) * (arcDeg / (m - 1));
      const rad = (baseDeg + offset) * DEG;
      const sx = px + sessionRing * Math.cos(rad);
      const sy = py + sessionRing * Math.sin(rad);
      const sessionNodeId = `sess:${session.sessionId}`;
      nodes.push({
        id: sessionNodeId,
        kind: "session",
        label: session.title,
        r: 6,
        seedX: clamp(sx, 0.04, 0.96),
        seedY: clamp(sy, 0.04, 0.96),
        projectKey: project.key,
        sessionId: session.sessionId,
      });
      links.push({
        id: `twig:${project.key}:${session.sessionId}`,
        source: projectId,
        target: sessionNodeId,
        spoke: false,
        distance: TWIG_DISTANCE,
      });
    });
  });

  return { nodes, links };
}
