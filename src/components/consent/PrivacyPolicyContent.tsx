/**
 * Privacy Policy Content Component
 *
 * Reusable React component displaying the privacy policy text.
 * Used in both the first-time consent modal and the always-accessible
 * policy view in settings.
 *
 * Covers: data capture, transmission, storage, third-party services,
 * data sharing, and user rights.
 */

export function PrivacyPolicyContent() {
  return (
    <div className="max-h-[300px] overflow-y-auto px-1 text-sm text-gray-700 space-y-4">
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">What Data Is Captured</h3>
        <p>
          This extension captures <strong>tab audio</strong> from your browser tabs
          (interviewer's voice) and <strong>microphone audio</strong> (your voice) when
          recording is active. No audio is recorded or stored — it is only transcribed
          in real-time and discarded immediately after processing.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-1">Where Data Is Sent</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>ElevenLabs API</strong> — for speech-to-text transcription of captured audio.
          </li>
          <li>
            <strong>OpenRouter or OpenAI API</strong> — for AI-generated interview assistance responses.
          </li>
        </ul>
        <p className="mt-1">
          Data is sent <strong>directly from your browser</strong> to these services — there are
          no intermediate servers operated by the extension developer.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-1">What Is Stored Locally</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>API keys</strong> — encrypted with AES-GCM-256 in chrome.storage.local.
          </li>
          <li>
            <strong>User preferences</strong> — model selections, hotkey bindings, blur level, and
            prompt templates.
          </li>
          <li>
            <strong>Consent acknowledgments</strong> — privacy policy acceptance timestamp and
            recording consent preferences.
          </li>
        </ul>
        <p className="mt-1">
          No audio, transcripts, or AI responses are persisted after a session ends.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-1">Third-Party Services</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>ElevenLabs</strong> — speech-to-text transcription.
          </li>
          <li>
            <strong>OpenRouter</strong> — LLM routing to multiple AI providers.
          </li>
          <li>
            <strong>OpenAI</strong> — direct LLM access.
          </li>
        </ul>
        <p className="mt-1">
          Each service has its own privacy policy. Your API keys authenticate directly with
          these services.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-1">Data Sharing</h3>
        <p>
          No data is shared with the extension developer or any third party beyond the API
          providers you configure. All processing happens locally in your browser or directly
          with your chosen API providers.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-1">Your Rights</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            You can <strong>delete all stored data</strong> by removing the extension from your browser.
          </li>
          <li>
            You can <strong>reset consent acknowledgments</strong> at any time in Settings.
          </li>
          <li>
            You <strong>control which API providers</strong> to use via your own API keys.
          </li>
        </ul>
      </section>

      <p className="text-xs italic text-gray-400 pt-2 border-t border-gray-100">
        This is a draft privacy policy for personal use. Consult a legal professional for
        distribution.
      </p>
    </div>
  );
}
