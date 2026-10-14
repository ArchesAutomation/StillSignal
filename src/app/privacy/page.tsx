export default function Privacy() {
  return (
    <main className="legal-page">
      <a href="/">← Trade Pulse</a>
      <h1>Your data, in context.</h1>
      <p>
        Trade Pulse stores heart-rate samples, trading events, session metadata,
        preferences, and self-reported journal entries. Every account starts
        empty. The isolated UI review uses separately labeled synthetic data.
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
        original file is not uploaded. SnapTrade handles brokerage login in its
        hosted portal and requests read-only access. Native API tokens are
        encrypted on the server and never included in browser storage or session
        exports. Some native providers issue tokens with trading privileges;
        TraderPulse exposes no order-placement functionality and calls only
        account, execution, and market-data endpoints.
      </p>
      <h2>Broker and market records</h2>
      <p>
        Broker synchronization stores raw executions, amendments, fees, account
        identities, and durable sync checkpoints separately from wearable
        samples. Historical fills go to an account-specific UTC daily journal.
        Unknown starting positions stay unclassified. Foreign currencies stay
        separate. Disconnecting stops synchronization immediately. The server
        credential is removed after any required remote revocation succeeds;
        pending revocation is shown explicitly. Revoke native tokens at the
        provider to invalidate their underlying grant. SnapTrade disconnect also
        revokes its brokerage authorizations.
      </p>
      <p>
        Market data is requested only under configured display entitlements.
        Storage and analytics permissions are checked separately. TradingView
        supplies the chart library, not the market feed. Historical replay shows
        only completed candles and does not infer intra-candle prices.
      </p>
      <h2>Controls</h2>
      <p>
        The optional Chrome voice journal extension uses a revocable journal-only
        credential paired through your signed-in account. Activated recordings
        are sent to the configured remote transcription provider (Groq or
        OpenAI). Unclear speech requires review.
        Raw audio stays only in extension storage during capture and retry and is
        removed after successful transcription or cancellation. Pending notes
        stay separated by account. Optional “Hey Journal” detection runs locally
        and requires a licensed custom model; listening is never restored after
        a browser restart or account change. Revoke an installation in Settings.
      </p>
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
