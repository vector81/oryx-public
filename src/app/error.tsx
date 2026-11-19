"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <div className="card">
        <h1>Could not load ORYX</h1>
        <p>
          The server could not load your records. Your data has not changed.
        </p>
        <button onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
