"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="legal-page">
      <h1>Let’s reconnect.</h1>
      <p>
        The dashboard encountered an error. Saved sessions remain in your
        browser.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
