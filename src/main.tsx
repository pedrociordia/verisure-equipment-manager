import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootEl = document.getElementById("root")!;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;background:#0b0b0c;color:#f5f5f7;padding:24px;">
      <div style="max-width:520px;text-align:left;background:#141416;border:1px solid #2a2a2e;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.45);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:10px;height:10px;border-radius:9999px;background:#E30613;"></div>
          <strong style="font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#a1a1a6;">Configuration error</strong>
        </div>
        <h1 style="font-size:22px;margin:0 0 8px 0;">Backend variables missing</h1>
        <p style="margin:0 0 14px 0;color:#c7c7cc;line-height:1.5;">
          The app could not start because the public backend configuration was not injected at build time.
        </p>
        <p style="margin:0;color:#8e8e93;font-size:13px;line-height:1.5;">
          Restart or rebuild the preview. If this persists, check that the project's environment is properly connected.
        </p>
      </div>
    </div>
  `;
} else {
  createRoot(rootEl).render(<App />);
}
