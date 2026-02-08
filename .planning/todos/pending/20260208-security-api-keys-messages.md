---
created: 2026-02-08
title: Security Fix - API Keys in Runtime Messages
area: bug
priority: P0
version: v1.1
complexity: low
estimate: 0.5 days
files:
  - src/types/messages.ts
  - entrypoints/popup/App.tsx
  - entrypoints/background.ts
  - src/services/transcription/elevenlabs.ts
---

## Problem

**CRITICAL SECURITY ISSUE:** API keys are passed through Chrome Runtime Messages, exposing them to potential interception.

**Location:**
- `src/types/messages.ts:173`
- `entrypoints/popup/App.tsx:294`

**Current code:**
```typescript
// ❌ INSECURE - API keys in messages
{
  type: 'START_TRANSCRIPTION',
  apiKey: apiKeys.elevenLabs  // Exposed in message passing
}
```

**Risk:**
- Any extension component can intercept messages
- Potential XSS vulnerability
- Logging/debugging may expose keys
- Chrome DevTools shows message contents

## User Impact

- **Security:** User API keys vulnerable to theft
- **Cost:** Stolen keys can incur charges
- **Privacy:** Unauthorized access to user data

## Solution

### Architecture Change

**Before (Insecure):**
```
Popup → Message(apiKey) → Background → ElevenLabs API
```

**After (Secure):**
```
Popup → Message(startTranscription) → Background (reads key from storage) → ElevenLabs API
```

### Implementation

**1. Remove API keys from message types:**

```typescript
// src/types/messages.ts

// ❌ REMOVE
export interface StartTranscriptionMessage {
  type: 'START_TRANSCRIPTION';
  apiKey: string;  // Remove this
}

// ✅ CORRECT
export interface StartTranscriptionMessage {
  type: 'START_TRANSCRIPTION';
  // No API key - background reads from storage
}
```

**2. Background reads keys from chrome.storage:**

```typescript
// entrypoints/background.ts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRANSCRIPTION') {
    // ✅ Read API key from secure storage
    const keys = await chrome.storage.local.get('apiKeys');
    const apiKey = keys.apiKeys?.elevenLabs;

    if (!apiKey) {
      sendResponse({ error: 'API key not configured' });
      return;
    }

    // Use API key directly in background
    await elevenLabsService.startTranscription(apiKey);
    sendResponse({ success: true });
  }
});
```

**3. Update popup to not send keys:**

```typescript
// entrypoints/popup/App.tsx

const handleStartTranscription = async () => {
  // ❌ REMOVE
  // chrome.runtime.sendMessage({
  //   type: 'START_TRANSCRIPTION',
  //   apiKey: apiKeys.elevenLabs
  // });

  // ✅ CORRECT - No API key in message
  chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION'
  });
};
```

### Security Principles

1. **API keys only in:**
   - Settings UI (user input)
   - chrome.storage.local (encrypted at rest by Chrome)
   - Background service worker (reads from storage)

2. **API keys NEVER in:**
   - Runtime messages
   - Content scripts
   - Logs or console
   - Popup → Background communication

3. **Validation:**
   - Background validates key exists before API calls
   - Return meaningful errors without exposing key

### Message Flow

**Starting transcription:**
```
1. User clicks "Start" in Popup
2. Popup sends: { type: 'START_TRANSCRIPTION' }
3. Background receives message
4. Background reads apiKey from chrome.storage.local
5. Background validates key exists
6. Background calls ElevenLabs API with key
7. Background responds: { success: true }
```

**Updating API keys:**
```
1. User enters key in Settings
2. Settings saves to chrome.storage.local directly
3. No message passing needed
```

### Implementation Steps

1. **Audit all message types** for API keys
   - Search codebase: `apiKey.*:.*string`
   - Remove from message interfaces

2. **Update background handlers**
   - Read keys from chrome.storage in background
   - Add error handling for missing keys

3. **Update popup/settings**
   - Remove API key from message payloads
   - Keep only in Settings → chrome.storage flow

4. **Test thoroughly**
   - Start transcription without keys in messages
   - Verify error handling for missing keys
   - Check Chrome DevTools Network tab (no keys)

5. **Add safeguards**
   - ESLint rule to prevent API keys in message types
   - Code review checklist

### Files to Update

- `src/types/messages.ts` - Remove apiKey fields
- `entrypoints/popup/App.tsx` - Remove apiKey from sendMessage
- `entrypoints/background.ts` - Read keys from storage
- `src/services/transcription/elevenlabs.ts` - Accept key from background only
- `src/services/llm/openai.ts` - Accept key from background only

### Testing Checklist

- [ ] No API keys in message types
- [ ] Background reads keys from storage
- [ ] Transcription starts without keys in messages
- [ ] LLM requests work without keys in messages
- [ ] Error handling for missing keys
- [ ] Chrome DevTools shows no keys in messages
- [ ] Settings still save keys correctly
- [ ] Keys persist across browser restart

### ESLint Rule (Optional)

```javascript
// .eslintrc.js
rules: {
  'no-api-keys-in-messages': {
    create(context) {
      return {
        Property(node) {
          if (node.key.name === 'apiKey' &&
              context.getFilename().includes('messages.ts')) {
            context.report({
              node,
              message: 'API keys must not be in message types'
            });
          }
        }
      };
    }
  }
}
```

### References

- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)
- [OWASP: Sensitive Data Exposure](https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure)

## Dependencies

- None (pure refactoring)

## Risk

**Low implementation risk:**
- Straightforward refactoring
- Testable change
- No external dependencies

**High security impact:**
- Prevents key theft
- Reduces attack surface
