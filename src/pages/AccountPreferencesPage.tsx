import { useEffect, useState } from "react";
import { useAuth } from "../auth/UseAuth";

type Theme = "light" | "dark";
type UnitPreference = "metric" | "imperial";
const THEME_KEY = "theme";
const UNIT_KEY = "unitPreference";
const MACROS_KEY = "showMacrosPerServing";

function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readUnitPreference(): UnitPreference {
  const stored = localStorage.getItem(UNIT_KEY);
  return stored === "imperial" ? "imperial" : "metric";
}

function readMacrosPreference(): boolean {
  return localStorage.getItem(MACROS_KEY) === "true";
}

export default function AccountPreferencesPage() {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(() => readUnitPreference());
  const [showMacros, setShowMacros] = useState<boolean>(() => readMacrosPreference());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(UNIT_KEY, unitPreference);
    window.dispatchEvent(
      new CustomEvent("unit-preference-change", { detail: { unit: unitPreference } })
    );
  }, [unitPreference]);

  useEffect(() => {
    localStorage.setItem(MACROS_KEY, String(showMacros));
    window.dispatchEvent(
      new CustomEvent("macros-preference-change", { detail: { enabled: showMacros } })
    );
  }, [showMacros]);

  return (
    <div className="stack">
      <div className="card stack">
        <div className="h2">Account</div>
        <div>
          <div className="muted small">Signed in as</div>
          <div>{user?.email ?? "Unknown"}</div>
        </div>
      </div>

      <div className="card stack">
        <div className="h2">Preferences</div>
        <div>
          <div className="h2">Theme</div>
          <div className="row">
            <button
              className={`btn ${theme === "light" ? "primary" : ""}`}
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
            >
              Light
            </button>
            <button
              className={`btn ${theme === "dark" ? "primary" : ""}`}
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
            >
              Dark
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Saved on this device.
          </div>
        </div>

        <div>
          <div className="h2">Default Measurements</div>
          <div className="row">
            <button
              className={`btn ${unitPreference === "metric" ? "primary" : ""}`}
              type="button"
              onClick={() => setUnitPreference("metric")}
              aria-pressed={unitPreference === "metric"}
            >
              Metric
            </button>
            <button
              className={`btn ${unitPreference === "imperial" ? "primary" : ""}`}
              type="button"
              onClick={() => setUnitPreference("imperial")}
              aria-pressed={unitPreference === "imperial"}
            >
              Imperial
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Used as the default in recipe scaling and displays.
          </div>
        </div>

        <div>
          <div className="h2">Macros & Calories</div>
          <div className="row">
            <button
              className={`btn ${showMacros ? "primary" : ""}`}
              type="button"
              onClick={() => setShowMacros(true)}
              aria-pressed={showMacros}
            >
              Show
            </button>
            <button
              className={`btn ${!showMacros ? "primary" : ""}`}
              type="button"
              onClick={() => setShowMacros(false)}
              aria-pressed={!showMacros}
            >
              Hide
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Placeholder for upcoming nutrition display.
          </div>
        </div>
      </div>
    </div>
  );
}
