export default function DashboardLoading() {
  return (
    <div style={{ padding: 24, fontFamily: "var(--font-ui, system-ui, sans-serif)" }}>
      <div style={{ width: 200, height: 28, background: "#1a1a1a", borderRadius: 6, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 160, background: "#1a1a1a", borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}
