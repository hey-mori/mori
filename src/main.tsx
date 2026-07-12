import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { installGlobalErrorMonitor } from "./app/errorMonitor";
import {
  applyThemePreferenceToDocument,
  loadThemePreference,
} from "./lib/settings/themePreference";
import "./styles/globals.css";

// Capture uncaught errors / unhandled rejections into the local diagnostics
// log from the very first frame (no remote telemetry; Settings exports it).
installGlobalErrorMonitor();

// Apply the saved appearance preference before the first paint so neither
// the color theme nor the type scale flashes back to the defaults on reload.
applyThemePreferenceToDocument(loadThemePreference());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
