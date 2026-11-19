export default function Loading() {
  return (
    <main className="content" aria-label="Loading ORYX">
      <div className="skeleton" style={{ height: 48 }} />
      <div className="stats">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 150 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 350 }} />
    </main>
  );
}
