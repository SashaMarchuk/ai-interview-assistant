---
created: 2026-02-08
title: Recording Consent and Legal Warnings
area: compliance
priority: P0
version: v1.1
complexity: low
estimate: 0.5-1 day
files:
  - entrypoints/popup/components/RecordingWarning.tsx
  - entrypoints/popup/components/ConsentDialog.tsx
  - src/store/settingsStore.ts
---

## Problem

**CRITICAL LEGAL ISSUE:** Extension records conversations without explicit consent warnings.

**Legal risks:**
- **Two-party consent states (CA, FL, IL, MA, WA, etc.):** Recording without all parties' consent is a **criminal offense**
- **One-party consent states:** Still risky if other party is in two-party state
- **International:** Many countries require consent (EU, Canada, Australia)
- **Corporate policies:** Many companies prohibit recording interviews

**Current state:**
- ❌ No warning about recording laws
- ❌ No prompt to inform other party
- ❌ No disclaimer about legal responsibility
- ❌ User may unknowingly commit a crime

## User Impact

- **Legal liability:** Criminal charges, lawsuits, fines
- **Job consequences:** Termination, blacklisting
- **Reputation:** Ethical concerns
- **Extension reputation:** Bad press, removal from Chrome Web Store

## Solution

### Two-Layer Consent System

**Layer 1: First-Time Warning (Cannot skip)**
**Layer 2: Per-Session Consent Reminder**

### First-Time Legal Warning

**Shows once on first use, must acknowledge:**

```tsx
// entrypoints/popup/components/RecordingWarning.tsx

function RecordingWarning() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('recording_warning_acknowledged').then(result => {
      setAcknowledged(result.recording_warning_acknowledged === true);
    });
  }, []);

  const handleAcknowledge = async () => {
    if (!understood) {
      alert('Please check the box to confirm you understand');
      return;
    }

    await chrome.storage.local.set({
      recording_warning_acknowledged: true,
      recording_warning_date: Date.now()
    });

    setAcknowledged(true);
  };

  if (acknowledged) return null;

  return (
    <div className="recording-warning modal">
      <div className="warning-content">
        <h1>⚠️ IMPORTANT LEGAL WARNING</h1>

        <div className="warning-box critical">
          <h2>Recording Consent Laws</h2>
          <p>
            <strong>Using this extension to record conversations may be ILLEGAL
            in your jurisdiction without consent.</strong>
          </p>

          <h3>🚨 Two-Party Consent States (US):</h3>
          <p>
            California, Connecticut, Florida, Illinois, Maryland, Massachusetts,
            Michigan, Montana, Nevada, New Hampshire, Pennsylvania, Washington
          </p>
          <p>
            In these states, recording a conversation without <strong>ALL
            parties' consent</strong> is a <strong>CRIMINAL OFFENSE</strong>
            with potential jail time and fines.
          </p>

          <h3>⚖️ Legal Requirements:</h3>
          <ul>
            <li>
              <strong>Inform all parties</strong> before recording
            </li>
            <li>
              <strong>Obtain explicit consent</strong> from everyone
            </li>
            <li>
              <strong>Document consent</strong> (verbal or written)
            </li>
            <li>
              <strong>Stop immediately</strong> if anyone objects
            </li>
          </ul>

          <h3>🌍 International Users:</h3>
          <p>
            Many countries (including Canada, Germany, UK, Australia) require
            consent. Check your local laws.
          </p>

          <h3>🏢 Corporate Policies:</h3>
          <p>
            Many employers and companies prohibit recording job interviews.
            This may violate:
          </p>
          <ul>
            <li>Company acceptable use policies</li>
            <li>Interview terms and conditions</li>
            <li>Non-disclosure agreements</li>
          </ul>
          <p>
            <strong>Violation may result in termination of interview,
            blacklisting, or job offer rescission.</strong>
          </p>
        </div>

        <div className="warning-box info">
          <h2>Your Responsibilities</h2>
          <ul>
            <li>✅ Know your local recording laws</li>
            <li>✅ Inform all parties before recording</li>
            <li>✅ Obtain explicit consent</li>
            <li>✅ Respect objections to recording</li>
            <li>✅ Check company/interview policies</li>
          </ul>

          <p>
            <strong>You are solely responsible for legal compliance.</strong>
            The developers of this extension assume no liability for your use.
          </p>
        </div>

        <div className="consent-section">
          <label>
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            <strong>
              I understand recording laws in my jurisdiction and will obtain
              all necessary consent before using this extension.
            </strong>
          </label>

          <button
            onClick={handleAcknowledge}
            disabled={!understood}
          >
            I Acknowledge and Accept Legal Responsibility
          </button>

          <p className="disclaimer">
            By clicking above, you confirm that you understand recording laws
            and will use this extension legally and ethically.
          </p>
        </div>

        <div className="resources">
          <h3>Resources:</h3>
          <ul>
            <li>
              <a href="https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations" target="_blank">
                Recording Laws by State (DMLP)
              </a>
            </li>
            <li>
              <a href="https://www.justia.com/50-state-surveys/recording-phone-calls-and-conversations/" target="_blank">
                State-by-State Recording Laws
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
```

### Per-Session Consent Reminder

**Shows each time user starts recording:**

```tsx
// entrypoints/popup/components/ConsentDialog.tsx

function ConsentDialog({ onConfirm, onCancel }: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [consent, setConsent] = useState({
    informed: false,
    obtained: false,
    legal: false
  });

  const [dontShowAgain, setDontShowAgain] = useState(false);

  const allChecked = consent.informed && consent.obtained && consent.legal;

  const handleConfirm = async () => {
    if (dontShowAgain) {
      await chrome.storage.local.set({
        skip_consent_dialog: true,
        skip_consent_date: Date.now()
      });
    }

    onConfirm();
  };

  return (
    <div className="consent-dialog modal">
      <h2>🎙️ Recording Consent</h2>

      <p>Before starting transcription, confirm:</p>

      <div className="checklist">
        <label>
          <input
            type="checkbox"
            checked={consent.informed}
            onChange={(e) => setConsent({ ...consent, informed: e.target.checked })}
          />
          I have <strong>informed all parties</strong> that this conversation
          will be recorded
        </label>

        <label>
          <input
            type="checkbox"
            checked={consent.obtained}
            onChange={(e) => setConsent({ ...consent, obtained: e.target.checked })}
          />
          I have <strong>obtained consent</strong> from all parties to record
        </label>

        <label>
          <input
            type="checkbox"
            checked={consent.legal}
            onChange={(e) => setConsent({ ...consent, legal: e.target.checked })}
          />
          Recording is <strong>legal and permitted</strong> in my jurisdiction
        </label>
      </div>

      <div className="reminder">
        <strong>⚠️ If you cannot check all boxes above, DO NOT record.</strong>
      </div>

      <div className="actions">
        <button
          onClick={handleConfirm}
          disabled={!allChecked}
          className="primary"
        >
          Start Recording
        </button>
        <button onClick={onCancel}>
          Cancel
        </button>
      </div>

      <label className="dont-show">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
        />
        Don't show this dialog again (I understand my legal obligations)
      </label>

      <p className="legal-note">
        By recording, you assume all legal responsibility. The extension
        developers are not liable for your use.
      </p>
    </div>
  );
}
```

### Integration with Recording Flow

```tsx
// entrypoints/popup/App.tsx

function App() {
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const handleStartRecording = async () => {
    // Check if user wants to skip consent dialog
    const { skip_consent_dialog } = await chrome.storage.local.get('skip_consent_dialog');

    if (!skip_consent_dialog) {
      setShowConsentDialog(true);
      return;
    }

    // Proceed with recording
    startRecording();
  };

  const handleConsentConfirmed = () => {
    setShowConsentDialog(false);
    startRecording();
  };

  const startRecording = async () => {
    // Log consent timestamp
    await chrome.storage.local.set({
      last_recording_consent: Date.now()
    });

    // Actual recording logic
    chrome.runtime.sendMessage({ type: 'START_TRANSCRIPTION' });
  };

  return (
    <div>
      {showConsentDialog && (
        <ConsentDialog
          onConfirm={handleConsentConfirmed}
          onCancel={() => setShowConsentDialog(false)}
        />
      )}

      <RecordingWarning />

      <button onClick={handleStartRecording}>
        Start Recording
      </button>
    </div>
  );
}
```

### Settings Option

**Settings → Legal → Recording Consent:**

```tsx
function LegalSettings() {
  const handleResetWarnings = async () => {
    await chrome.storage.local.remove([
      'recording_warning_acknowledged',
      'skip_consent_dialog'
    ]);

    alert('Consent dialogs reset. They will show again on next use.');
  };

  return (
    <div>
      <h2>Legal Settings</h2>

      <section>
        <h3>Recording Consent</h3>
        <p>
          Manage consent warnings and legal acknowledgments.
        </p>
        <button onClick={handleResetWarnings}>
          Reset Consent Dialogs
        </button>
      </section>

      <section>
        <h3>Legal Resources</h3>
        <ul>
          <li>
            <a href="[legal-guide-url]" target="_blank">
              Recording Laws Guide
            </a>
          </li>
          <li>
            <a href="[privacy-policy-url]" target="_blank">
              Privacy Policy
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
```

### Disclaimer in README

**Add to README.md:**

```markdown
## ⚠️ IMPORTANT LEGAL NOTICE

### Recording Consent Requirements

**This extension records conversations. Recording without consent may be ILLEGAL.**

#### United States
In **two-party consent states** (CA, FL, IL, MA, WA, and others), recording
without all parties' consent is a criminal offense.

#### International
Many countries require consent. Check your local laws.

#### Your Responsibilities
- ✅ Know recording laws in your jurisdiction
- ✅ Inform all parties before recording
- ✅ Obtain explicit consent from everyone
- ✅ Respect objections to recording
- ✅ Check company/interview policies

**You are solely responsible for legal compliance. The developers assume no
liability for your use of this extension.**

### Recommended Practices

1. **Inform upfront:** "I'm using an AI assistant. Is it okay if I record this
   conversation?"
2. **Wait for explicit consent:** Don't proceed without clear "yes"
3. **Document consent:** Note the consent in your records
4. **When in doubt, don't record:** Use extension without recording feature

### Resources
- [Recording Laws by State (DMLP)](https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations)
- [State-by-State Recording Laws](https://www.justia.com/50-state-surveys/recording-phone-calls-and-conversations/)
```

### Implementation Steps

1. **Create RecordingWarning component**
   - First-time modal with legal information
   - Checkbox acknowledgment
   - Cannot use extension without acknowledgment

2. **Create ConsentDialog component**
   - Per-session consent checklist
   - Don't show again option
   - Blocking (must confirm or cancel)

3. **Integrate with recording flow**
   - Check acknowledgment before recording
   - Show consent dialog if not skipped
   - Log consent timestamps

4. **Add Settings page**
   - Reset consent dialogs option
   - Link to legal resources

5. **Update README**
   - Add legal warning section
   - Recording best practices
   - Link to resources

6. **Testing**
   - First-time flow
   - Per-session flow
   - Skip dialog functionality
   - Reset functionality

### Files to Create/Update

- `entrypoints/popup/components/RecordingWarning.tsx`
- `entrypoints/popup/components/ConsentDialog.tsx`
- `entrypoints/popup/pages/LegalSettings.tsx`
- `entrypoints/popup/App.tsx` (integrate dialogs)
- `README.md` (add legal warning)

### Testing Checklist

- [ ] First-time warning shows and blocks usage
- [ ] Cannot proceed without acknowledgment
- [ ] Per-session consent dialog shows
- [ ] All checkboxes must be checked
- [ ] "Don't show again" works
- [ ] Recording starts after consent
- [ ] Cancel button works
- [ ] Reset consent dialogs works
- [ ] Warning shows again after reset
- [ ] Consent timestamps logged

### Legal Considerations

**This todo provides:**
- ✅ User education
- ✅ Consent mechanism
- ✅ Liability disclaimer

**This does NOT provide:**
- ❌ Legal advice
- ❌ Guarantee of legality
- ❌ Protection from prosecution

**Recommend:** Consult lawyer before public release.

### Alternative: Disable by Default

**More conservative approach:**
```tsx
// Recording disabled by default
// User must explicitly enable in Settings after reading warnings
const [recordingEnabled, setRecordingEnabled] = useState(false);

// In Settings
<label>
  <input
    type="checkbox"
    checked={recordingEnabled}
    onChange={handleEnableRecording}
  />
  Enable Recording (I understand legal requirements)
</label>
```

### Timeline

- **Design dialogs:** 1 hour
- **Implement components:** 2-3 hours
- **Integrate flow:** 1-2 hours
- **Update README:** 1 hour
- **Testing:** 1 hour

**Total:** 0.5-1 day

## References

- [DMLP: Recording Phone Calls](https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations)
- [Justia: State Recording Laws](https://www.justia.com/50-state-surveys/recording-phone-calls-and-conversations/)
- [ACLU: Workplace Privacy](https://www.aclu.org/issues/privacy-technology/workplace-privacy)
