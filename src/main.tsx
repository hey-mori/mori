import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { applyThemeToDocument, loadThemePreference } from "./lib/settings/themePreference";
import "./styles/globals.css";

// Apply the saved theme before the first paint so a non-default theme
// does not flash the default on reload.
applyThemeToDocument(loadThemePreference().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
