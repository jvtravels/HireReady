export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        minHeight: "100vh",
        background: "#060607",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 36,
            height: 36,
            border: "2px solid rgba(212,179,127,0.15)",
            borderTopColor: "#D4B37F",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <span
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 20,
            color: "#F5F2ED",
            letterSpacing: "0.02em",
          }}
        >
          HireStepX
        </span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
