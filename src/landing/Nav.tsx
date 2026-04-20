import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { c, font } from "../tokens";
import { useAuth } from "../AuthContext";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { isLoggedIn, loading, logout } = useAuth();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen && mobileMenuRef.current) {
      mobileMenuRef.current.focus();
    }
  }, [mobileOpen]);

  return (
    <header>
    <a href="#main-content" className="skip-to-content">Skip to main content</a>
    <nav aria-label="Main navigation" style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 48px", height: 72,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(6,6,7,0.72)" : "transparent",
      backdropFilter: scrolled ? "blur(32px) saturate(180%)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(32px) saturate(180%)" : "none",
      borderBottom: scrolled ? `1px solid ${c.border}` : "1px solid transparent",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      animation: "navSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
    }}>
      <style>{`@keyframes navSlideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, letterSpacing: "0.02em", color: c.ivory, cursor: "pointer" }}>
        HireStepX
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen}
        style={{
          display: "none", background: "none", border: "none", cursor: "pointer", padding: 8,
          color: c.ivory, position: "relative", zIndex: 102,
        }}
        className="mobile-nav-toggle"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {mobileOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
        </svg>
      </button>

      {/* Desktop nav */}
      <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {["How It Works", "Features", "Pricing"].map((item) => (
          <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
            className="hover-underline"
            onClick={(e) => { e.preventDefault(); document.getElementById(item.toLowerCase().replace(/ /g, "-"))?.scrollIntoView({ behavior: "smooth" }); }}
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 400, color: c.stone, textDecoration: "none", transition: "color 0.2s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = c.ivory)}
            onMouseLeave={(e) => (e.currentTarget.style.color = c.stone)}>
            {item}
          </a>
        ))}
        {loading ? (
          <div style={{ width: 140, height: 36 }} />
        ) : isLoggedIn ? (
          <>
            <Link to="/dashboard" className="premium-btn" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              borderRadius: 10, padding: "9px 22px",
              cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Dashboard
            </Link>
            <button onClick={logout} style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone,
              background: "transparent", border: "none", padding: "8px 16px",
              cursor: "pointer", transition: "color 0.2s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk,
              background: "transparent", border: "none", padding: "8px 16px",
              cursor: "pointer", letterSpacing: "0.01em", transition: "color 0.2s ease",
              textDecoration: "none",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.chalk; }}>
              Log in
            </Link>
            <Link to="/signup" className="shimmer-btn premium-btn" style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              borderRadius: 10, padding: "9px 22px",
              cursor: "pointer", letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Sign up
            </Link>
          </>
        )}
      </div>

      {/* Mobile overlay nav */}
      {mobileOpen && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dialog needs keyboard trap for accessibility
        <div
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setMobileOpen(false); return; }
            if (e.key === "Tab") {
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])");
              if (focusable.length === 0) return;
              const first = focusable[0], last = focusable[focusable.length - 1];
              if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
              else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
            }
          }}
          style={{
          position: "fixed", inset: 0, background: "rgba(6,6,7,0.95)", backdropFilter: "blur(20px)",
          zIndex: 101, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
          outline: "none",
        }} onClick={() => setMobileOpen(false)}>
          {["How It Works", "Features", "Pricing"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              onClick={(e) => { e.preventDefault(); setMobileOpen(false); document.getElementById(item.toLowerCase().replace(/ /g, "-"))?.scrollIntoView({ behavior: "smooth" }); }}
              style={{ fontFamily: font.ui, fontSize: 18, color: c.ivory, textDecoration: "none" }}>
              {item}
            </a>
          ))}
          <div style={{ width: 40, height: 1, background: c.border, margin: "4px 0" }} />
          {loading ? null : isLoggedIn ? (
            <>
              <Link to="/dashboard" style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.gilt, textDecoration: "none" }}>Dashboard</Link>
              <button onClick={() => { logout(); setMobileOpen(false); }} style={{ fontFamily: font.ui, fontSize: 16, color: c.stone, background: "none", border: "none", cursor: "pointer" }}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontFamily: font.ui, fontSize: 18, color: c.ivory, textDecoration: "none" }}>Log in</Link>
              <Link to="/signup" style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.gilt, textDecoration: "none" }}>Sign up</Link>
            </>
          )}
        </div>
      )}
    </nav>
    </header>
  );
}
