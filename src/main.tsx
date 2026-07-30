import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { installGlobalErrorMonitor } from "./app/errorMonitor";
import { LanguageOverlayApp } from "./features/language/LanguageOverlayApp";
import {
  applyThemePreferenceToDocument,
  loadThemePreference,
} from "./lib/settings/themePreference";
import "./styles/globals.css";

/**
 * The global language overlay is a second native window on the same bundle, so
 * the entry point picks the surface from the URL the window was created with
 * (`overlay.rs` builds it with `?surface=language-overlay`). One bundle keeps
 * the overlay on the same components, tokens, and CSP as the main app.
 */
function selectedSurface(): "app" | "language-overlay" {
  if (typeof window === "undefined") return "app";
  const surface = new URLSearchParams(window.location.search).get("surface");
  return surface === "language-overlay" ? "language-overlay" : "app";
}

// Capture uncaught errors / unhandled rejections into the local diagnostics
// log from the very first frame (no remote telemetry; Settings exports it).
installGlobalErrorMonitor();

// Apply the saved appearance preference before the first paint so neither
// the color theme nor the type scale flashes back to the defaults on reload.
applyThemePreferenceToDocument(loadThemePreference());

const surface = selectedSurface();
// The overlay window is borderless and sized to its content; the shell's
// full-viewport layout would otherwise force a scrollbar inside a 400px window.
document.documentElement.dataset.surface = surface;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{surface === "language-overlay" ? <LanguageOverlayApp /> : <App />}</StrictMode>,
);
