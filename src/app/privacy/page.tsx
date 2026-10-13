export default function Privacy() {
  return (
    <main className="legal-page">
      <a href="/">← Trade Pulse</a>
      <h1>Your data, in context.</h1>
      <p>
        Trade Pulse stores heart-rate samples, trading events, session metadata,
        preferences, and self-reported journal entries. Every account starts
        empty. No sample trading or physiological data is generated.
      </p>
      <h2>Your private workspace</h2>
      <p>
        A Supabase account is required. Recordings are associated with your
        account ID. Database access policies and authenticated server checks
        isolate each account’s records. Use your own account for private
        recordings; people sharing a demo login also share that demo workspace.
      </p>
      <h2>Recording and synchronization</h2>
      <p>
        While recording, samples are saved to a local browser buffer and
        uploaded in batches. Signed-in sessions synchronize to Supabase.
        Clearing browser data can remove unsynchronized recordings. Other people
        with access to your browser profile or operating system may inspect
        local storage; use a separate browser profile on a shared device.
      </p>
      <h2>Integrations</h2>
      <p>
        Bluetooth pairing reads broadcast heart rate from the selected sensor
        without accessing your WHOOP account. TradingView only sends alerts you
        configure. Its account connection can only append trading events to
        daily journals, expires after 30 days, and can be rotated or revoked.
        Existing session-scoped 24-hour keys remain supported. CSV files are
        parsed in your browser; only the events you confirm are stored. The
        original file is not uploaded. No broker passwords or order-execution
        permissions are collected.
      </p>
      <h2>Controls</h2>
      <p>
        Voice dictation starts only when you use the shortcut or choose to
        answer a check-in. Your browser's speech service may process audio
        remotely; Trade Pulse stores the reviewed transcript, not an audio
        recording. Screenshots are stored in a private account-owned bucket and
        displayed using short-lived links. Screenshot contents are not sent for
        AI interpretation.
      </p>
      <p>
        Personal insights count your confirmed labels, HR context and proximity
        to recorded losses across your available journal history. Follow-up
        questions use these observations. Learned sensitivity is based on your
        own HR-linked check-ins after enough records exist; it can be disabled
        in Settings. No separate generative AI model is trained on your records.
      </p>
      <p>
        Export the selected session as JSON from Settings. Deleting it removes
        its cloud records and its local records on this device. Copies on other
        offline devices and prior exports must be removed separately. Sign-out
        closes your workspace; it does not erase browser storage.
      </p>
      <h2>Collection limits</h2>
      <p>
        Keep the recording tab open and your device awake. Browser suspension or
        sensor disconnection can interrupt recording. Missing intervals stay
        blank. The app provides descriptive statistics and does not diagnose
        emotions, medical conditions, or trading outcomes.
      </p>
    </main>
  );
}
