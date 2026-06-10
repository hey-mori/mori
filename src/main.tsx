import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import {
  applyThemePreferenceToDocument,
  loadThemePreference,
} from "./lib/settings/themePreference";
import "./styles/globals.css";

// Apply the saved appearance preference before the first paint so neither
// the color theme nor the type scale flashes back to the defaults on reload.
applyThemePreferenceToDocument(loadThemePreference());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
