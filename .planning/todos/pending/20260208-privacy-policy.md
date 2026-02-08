---
created: 2026-02-08
title: Create Privacy Policy and Compliance Documentation
area: docs
priority: P0
version: v1.1
complexity: low
estimate: 0.5-1 day
files:
  - PRIVACY.md
  - docs/privacy-policy.md
  - entrypoints/popup/components/PrivacyNotice.tsx
  - manifest.json
---

## Problem

**CRITICAL COMPLIANCE ISSUE:** Missing Privacy Policy required for Chrome Web Store and legal compliance.

**Requirements:**
- Chrome Web Store requires Privacy Policy for extensions that handle user data
- GDPR (EU) requires disclosure of data processing
- CCPA (California) requires disclosure and user rights
- No mechanism for users to export/delete their data

**Current state:**
- ❌ No Privacy Policy document
- ❌ No user consent mechanism
- ❌ No data deletion mechanism
- ❌ No disclosure of what data is collected

## User Impact

- **Legal:** Cannot publish to Chrome Web Store without policy
- **Trust:** Users don't know how their data is used
- **Compliance:** Violates GDPR/CCPA requirements
- **Liability:** Legal exposure for developer

## Solution

### Privacy Policy Document

**Create comprehensive Privacy Policy covering:**

1. **What data we collect:**
   - API keys (OpenAI, ElevenLabs)
   - Transcription data (audio → text)
   - LLM responses
   - Usage statistics (optional)
   - Browser metadata (user agent, timezone)

2. **How we use data:**
   - Local processing only (no backend)
   - API calls to OpenAI/ElevenLabs (user's keys)
   - No data sent to our servers
   - No analytics or tracking (unless user opts in)

3. **Data storage:**
   - chrome.storage.local (encrypted API keys)
   - IndexedDB (transcript history)
   - No cloud storage
   - Data stays on user's device

4. **Third-party services:**
   - OpenAI API (user's key, their privacy policy applies)
   - ElevenLabs API (user's key, their privacy policy applies)
   - No other third parties

5. **User rights:**
   - Access: View all stored data
   - Export: Download data as JSON
   - Delete: Clear all data from extension
   - Portability: Export in standard formats

6. **Data retention:**
   - Indefinite (until user deletes)
   - Auto-cleanup option (configurable)
   - No automatic cloud backup

7. **Security:**
   - Encrypted API key storage
   - No plaintext sensitive data
   - Chrome's sandbox isolation

8. **Changes to policy:**
   - How users will be notified
   - Effective date

9. **Contact information:**
   - Email for privacy questions
   - Data deletion requests

### Privacy Policy Template

```markdown
# Privacy Policy for AI Interview Assistant

**Effective Date:** [DATE]
**Last Updated:** [DATE]

## Introduction

AI Interview Assistant ("we", "our", or "the extension") is a Chrome browser extension that helps users during interviews using AI-powered transcription and assistance. This Privacy Policy explains how we handle your data.

## Data Collection

We collect and process the following data:

### Data You Provide
- **API Keys:** OpenAI and ElevenLabs API keys that you enter in Settings
- **Configuration:** Your preferences, prompts, and settings

### Data Generated During Use
- **Transcriptions:** Audio converted to text via ElevenLabs API
- **LLM Responses:** AI-generated responses from OpenAI API
- **Session Metadata:** Date, duration, and tags you add to sessions

### Data We Do NOT Collect
- ❌ Your audio recordings (not stored)
- ❌ Personal identification information
- ❌ Analytics or usage tracking (unless you opt in)
- ❌ Your conversations are NOT sent to us

## How We Use Your Data

- **Local Processing:** All data processing happens on your device
- **API Calls:** Your API keys are used to call OpenAI/ElevenLabs on your behalf
- **Storage:** Data is stored locally in your browser (chrome.storage and IndexedDB)
- **No Backend:** We do not have servers that receive your data

## Data Storage

- **Location:** All data stored locally on your device
- **Duration:** Data persists until you delete it
- **Security:** API keys are encrypted using WebCrypto API
- **Access:** Only the extension can access this data (Chrome's sandbox)

## Third-Party Services

### OpenAI
- Your transcripts and prompts are sent to OpenAI API using your API key
- OpenAI's Privacy Policy applies: https://openai.com/policies/privacy-policy

### ElevenLabs
- Your audio is sent to ElevenLabs API using your API key for transcription
- ElevenLabs Privacy Policy applies: https://elevenlabs.io/privacy

**We do not control these third-party services.** Review their privacy policies.

## Your Rights

### Access Your Data
Settings → History → View all your sessions and transcripts

### Export Your Data
Settings → History → Export All → Download as JSON

### Delete Your Data
Settings → History → Clear All Data → Permanent deletion

### Opt Out of Analytics
Settings → Privacy → Disable Usage Statistics (if implemented)

## Data Security

- API keys encrypted with AES-GCM
- Chrome's security sandbox isolates extension
- No transmission to our servers
- Regular security audits

## Children's Privacy

This extension is not intended for users under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this Privacy Policy. Changes will be:
- Posted in the extension
- Notified via popup on first launch after update
- Effective immediately upon posting

## Legal Compliance

### GDPR (EU Users)
- Right to access: View/export your data
- Right to deletion: Clear all data
- Right to portability: Export in JSON format
- Data processing basis: Your consent (using the extension)

### CCPA (California Users)
- Right to know: This policy discloses what we collect
- Right to delete: Clear all data in Settings
- Right to opt-out: Don't use the extension or delete it
- No sale of personal information: We don't sell any data

## Contact Us

For privacy questions or data deletion requests:
- Email: [YOUR EMAIL]
- GitHub Issues: [REPO URL]/issues

## Consent

By using AI Interview Assistant, you consent to this Privacy Policy.

---

**Note:** This extension processes sensitive data (interview conversations). Use at your own risk. Always check your organization's policies before recording conversations.
```

### In-App Privacy Notice

**First-time user flow:**

```tsx
// entrypoints/popup/components/PrivacyNotice.tsx

function PrivacyNotice() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('privacy_accepted').then(result => {
      setAccepted(result.privacy_accepted === true);
    });
  }, []);

  const handleAccept = async () => {
    await chrome.storage.local.set({ privacy_accepted: true });
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="privacy-notice">
      <h2>Privacy & Data Usage</h2>
      <p>
        AI Interview Assistant processes interview audio and text locally.
        Your data:
      </p>
      <ul>
        <li>✅ Stays on your device (chrome.storage, IndexedDB)</li>
        <li>✅ API keys encrypted</li>
        <li>✅ Sent only to OpenAI/ElevenLabs (your keys)</li>
        <li>❌ NOT sent to our servers</li>
        <li>❌ NOT shared with anyone</li>
      </ul>

      <p>
        <strong>⚠️ Important:</strong> Recording conversations may require
        consent in your jurisdiction. Check local laws.
      </p>

      <a href="privacy-policy.html" target="_blank">
        Read Full Privacy Policy
      </a>

      <button onClick={handleAccept}>
        I Understand and Accept
      </button>
    </div>
  );
}
```

### Data Deletion Mechanism

**Settings → Privacy:**

```tsx
function PrivacySettings() {
  const handleExportData = async () => {
    const data = {
      settings: await chrome.storage.local.get(),
      sessions: await transcriptDB.getAllSessions(),
      transcripts: await transcriptDB.getAllTranscripts()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-interview-assistant-data-${Date.now()}.json`;
    a.click();
  };

  const handleDeleteAllData = async () => {
    if (!confirm('Delete ALL data? This cannot be undone!')) {
      return;
    }

    // Clear chrome.storage
    await chrome.storage.local.clear();

    // Clear IndexedDB
    await transcriptDB.clearAll();

    alert('All data deleted successfully');
  };

  return (
    <div>
      <h2>Privacy Settings</h2>

      <section>
        <h3>Your Data</h3>
        <button onClick={handleExportData}>
          Export All Data (JSON)
        </button>
        <button onClick={handleDeleteAllData} className="danger">
          Delete All Data
        </button>
      </section>

      <section>
        <h3>Privacy Policy</h3>
        <a href="privacy-policy.html" target="_blank">
          View Privacy Policy
        </a>
      </section>
    </div>
  );
}
```

### Update manifest.json

```json
{
  "manifest_version": 3,
  "name": "AI Interview Assistant",
  "description": "...",
  "homepage_url": "https://your-website.com/privacy",
  "permissions": [
    "storage"
  ]
}
```

### Implementation Steps

1. **Write Privacy Policy**
   - Use template above
   - Customize with your email/contact info
   - Review with legal counsel (recommended)

2. **Create PRIVACY.md**
   - Add to repository root
   - Link from README.md

3. **Create in-app privacy notice**
   - First-time user popup
   - Acceptance tracking
   - Link to full policy

4. **Add data export functionality**
   - Settings → Privacy → Export Data
   - JSON format with all user data

5. **Add data deletion functionality**
   - Settings → Privacy → Delete All Data
   - Confirmation dialog
   - Complete wipe (storage + IndexedDB)

6. **Publish Privacy Policy**
   - Host at static URL (GitHub Pages or your site)
   - Add to Chrome Web Store listing

7. **Update README**
   - Link to Privacy Policy
   - Mention data handling

### Chrome Web Store Requirements

When submitting extension, provide:
- **Privacy Policy URL:** https://your-site.com/privacy
- **Permissions justification:**
  - `storage`: Store user settings and API keys
  - `activeTab`: Access page for overlay injection
  - `scripting`: Inject overlay content script

### Legal Considerations

**Consult a lawyer for:**
- GDPR compliance details
- CCPA compliance
- State-specific recording laws
- Terms of Service

**This todo provides template, not legal advice.**

### Files to Create/Update

- `PRIVACY.md` (repository)
- `docs/privacy-policy.html` (static hosting)
- `entrypoints/popup/components/PrivacyNotice.tsx`
- `entrypoints/popup/pages/PrivacySettings.tsx`
- `README.md` (add privacy section)

### Testing Checklist

- [ ] Privacy Policy document created
- [ ] Privacy notice shows on first use
- [ ] Acceptance tracked in storage
- [ ] Export data functionality works
- [ ] Delete data functionality works
- [ ] All data removed after deletion
- [ ] Privacy Policy hosted at stable URL
- [ ] Chrome Web Store listing updated
- [ ] README links to Privacy Policy

### Timeline

- **Write policy:** 2-3 hours
- **Implement in-app notice:** 1-2 hours
- **Data export/delete:** 2-3 hours
- **Testing:** 1 hour
- **Legal review (optional):** Variable

**Total:** 0.5-1 day

## References

- [Chrome Web Store Privacy Practices](https://developer.chrome.com/docs/webstore/program-policies/)
- [GDPR Compliance Checklist](https://gdpr.eu/checklist/)
- [CCPA Compliance Guide](https://oag.ca.gov/privacy/ccpa)
- [Privacy Policy Generator](https://www.privacypolicygenerator.info/)
