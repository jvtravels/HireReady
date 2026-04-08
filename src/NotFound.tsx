import { Link } from "react-router-dom";
import { c, font } from "./tokens";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh", background: c.obsidian,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 40, textAlign: "center",
    }}>
      <span style={{ fontFamily: font.display, fontSize: 80, fontWeight: 400, color: c.gilt, lineHeight: 1, marginBottom: 16 }}>404</span>
      <h1 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>Page not found</h1>
      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 32, maxWidth: 360, lineHeight: 1.6 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" style={{
        fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.obsidian,
        background: c.gilt, padding: "12px 28px", borderRadius: 8, textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Home
      </Link>
    </div>
  );
}
