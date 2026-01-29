# Phase 4: LLM Integration - Research

**Researched:** 2026-01-29
**Domain:** Dual parallel LLM streaming via OpenRouter API, hotkey capture modes, prompt variable substitution
**Confidence:** HIGH

## Summary

This phase implements the core LLM interaction flow: capturing questions via hotkey (hold-to-release or highlight-to-send), sending dual parallel requests to OpenRouter (fast model for immediate hint, full model for comprehensive answer), and streaming both responses simultaneously to the overlay UI.

The research confirms OpenRouter provides OpenAI-compatible APIs with full SSE streaming support. The critical architectural decision is to implement LLM requests from the **Service Worker (background.ts)**, not the Offscreen Document or content script. This keeps the LLM logic centralized, leverages the existing message-passing infrastructure, and avoids duplicate API keys in multiple contexts.

For keyboard handling, Chrome extensions require a hybrid approach: use `chrome.commands` API for global hotkey registration (works even when page doesn't have focus), combined with `keydown/keyup` listeners in the content script for hold detection and visual feedback. The hold-to-capture mode tracks key state (pressed duration) and triggers LLM requests on release.

The existing codebase already has: prompt templates with `$highlighted`, `$recent`, `$transcript` variables (src/utils/promptSubstitution.ts), LLMResponse type (src/types/transcript.ts), ResponsePanel component (src/overlay/ResponsePanel.tsx), and models configured in settings (fastModel, fullModel).

**Primary recommendation:** Use native fetch with ReadableStream for SSE parsing (via eventsource-parser), fire dual parallel requests with Promise.allSettled, update UI state incrementally as tokens stream in, and implement hold detection via keydown/keyup listeners in content script.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| eventsource-parser | ^3.0 | Parse SSE streams from OpenRouter | 8.8M weekly downloads, standard for LLM streaming |
| Native fetch | Browser API | HTTP requests to OpenRouter | No external library needed; supports streaming |
| chrome.commands | Browser API | Global hotkey registration | Required for extension keyboard shortcuts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | Browser API | Cancel in-flight LLM requests | When user triggers new request or navigates away |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| eventsource-parser | openai npm SDK | SDK adds ~400KB, we only need SSE parsing |
| eventsource-parser | @openrouter/sdk | Official SDK but less mature, eventsource-parser is battle-tested |
| Native fetch | axios | No streaming support in axios, fetch is required for SSE |

**Installation:**
```bash
npm install eventsource-parser
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── llm/
│       ├── index.ts                # Re-exports
│       ├── types.ts                # LLM-specific types (OpenRouter response shapes)
│       ├── OpenRouterClient.ts     # SSE streaming client
│       └── PromptBuilder.ts        # Build prompts with variable substitution
├── hooks/
│   └── useCaptureMode.ts           # React hook for capture state in content script
└── entrypoints/
    ├── background.ts               # Add LLM request handling
    └── content.tsx                 # Add keyboard listeners for hold detection
```

### Pattern 1: Dual Parallel LLM Streaming
**What:** Fire two requests simultaneously using Promise.allSettled, stream both responses independently to the UI.
**When to use:** Always on hotkey trigger - this is the core feature.
**Example:**
```typescript
// Source: Architecture decision based on OpenRouter streaming docs

interface DualLLMRequest {
  question: string;
  context: string;
  transcript: string;
  templateId: string;
}

interface StreamCallbacks {
  onFastToken: (token: string) => void;
  onFullToken: (token: string) => void;
  onFastComplete: () => void;
  onFullComplete: () => void;
  onError: (model: 'fast' | 'full', error: string) => void;
}

async function sendDualLLMRequests(
  request: DualLLMRequest,
  callbacks: StreamCallbacks,
  abortSignal: AbortSignal
): Promise<void> {
  const { fastModel, fullModel, openRouterKey } = await getSettings();

  // Build prompts from template
  const prompt = buildPrompt(request);

  // Fire both requests in parallel - don't wait for either
  const fastPromise = streamLLMResponse({
    model: fastModel,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    maxTokens: 100, // Short hint
    onToken: callbacks.onFastToken,
    onComplete: callbacks.onFastComplete,
    onError: (e) => callbacks.onError('fast', e),
    abortSignal,
    apiKey: openRouterKey,
  });

  const fullPromise = streamLLMResponse({
    model: fullModel,
    systemPrompt: prompt.system,
    userPrompt: prompt.userWithDetail, // Extended prompt for full answer
    maxTokens: 1000,
    onToken: callbacks.onFullToken,
    onComplete: callbacks.onFullComplete,
    onError: (e) => callbacks.onError('full', e),
    abortSignal,
    apiKey: openRouterKey,
  });

  // Wait for both to settle (don't fail fast)
  await Promise.allSettled([fastPromise, fullPromise]);
}
```

### Pattern 2: OpenRouter SSE Streaming with eventsource-parser
**What:** Parse SSE stream from OpenRouter using eventsource-parser's createParser.
**When to use:** For all OpenRouter streaming requests.
**Example:**
```typescript
// Source: https://openrouter.ai/docs/api/reference/streaming
// Source: https://github.com/rexxars/eventsource-parser

import { createParser, type EventSourceMessage } from 'eventsource-parser';

interface StreamOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  abortSignal: AbortSignal;
  apiKey: string;
}

async function streamLLMResponse(options: StreamOptions): Promise<void> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': chrome.runtime.getURL(''),
      'X-Title': 'AI Interview Assistant',
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
      max_tokens: options.maxTokens,
      stream: true,
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      if (event.data === '[DONE]') {
        options.onComplete();
        return;
      }

      try {
        const parsed = JSON.parse(event.data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          options.onToken(content);
        }

        // Check for mid-stream errors
        if (parsed.error) {
          options.onError(parsed.error.message || 'Stream error');
        }

        // Check finish reason
        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason === 'error') {
          options.onError('Model returned error finish reason');
        }
      } catch (e) {
        // Ignore parse errors for comment lines
      }
    },
    onComment: () => {
      // Ignore OPENROUTER PROCESSING comments
    },
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
}
```

### Pattern 3: Hold-to-Capture Keyboard Detection
**What:** Track keydown/keyup events to detect hold gesture, show visual indicator while held, trigger on release.
**When to use:** Default capture mode for interview assistant.
**Example:**
```typescript
// Source: React pattern from https://www.createit.com/blog/key-combination-holding-event-in-react-3/

interface CaptureState {
  isHolding: boolean;
  startTime: number | null;
  capturedText: string;
}

function useCaptureMode(targetKey: string) {
  const [state, setState] = useState<CaptureState>({
    isHolding: false,
    startTime: null,
    capturedText: '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for configured hotkey (e.g., "Ctrl+Shift+Space")
      if (!matchesHotkey(e, targetKey)) return;
      if (e.repeat) return; // Ignore repeat events

      e.preventDefault();
      setState(prev => ({
        ...prev,
        isHolding: true,
        startTime: Date.now(),
      }));

      // Start capturing transcript text from this moment
      markCaptureStart();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!matchesHotkey(e, targetKey)) return;
      if (!state.isHolding) return;

      e.preventDefault();

      // Get captured text (transcript entries since capture started)
      const capturedText = getCapturedText(state.startTime);

      setState({
        isHolding: false,
        startTime: null,
        capturedText: capturedText,
      });

      // Trigger LLM request
      if (capturedText.trim()) {
        sendCapturedQuestion(capturedText);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [targetKey, state.isHolding]);

  return state;
}

function matchesHotkey(e: KeyboardEvent, hotkeyString: string): boolean {
  // Parse "Ctrl+Shift+Space" format
  const parts = hotkeyString.split('+').map(p => p.toLowerCase());
  const key = parts[parts.length - 1];
  const needsCtrl = parts.includes('ctrl');
  const needsShift = parts.includes('shift');
  const needsAlt = parts.includes('alt');

  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === needsCtrl &&
    e.shiftKey === needsShift &&
    e.altKey === needsAlt
  );
}
```

### Pattern 4: Highlight-to-Send Mode
**What:** User selects transcript text, presses hotkey, selected text sent to LLM.
**When to use:** Alternative capture mode when user wants to ask about specific past transcript.
**Example:**
```typescript
// Source: MDN Web Docs - Window.getSelection()

function getHighlightedText(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';
  return selection.toString().trim();
}

function handleHighlightCapture(e: KeyboardEvent, hotkeyString: string): void {
  if (!matchesHotkey(e, hotkeyString)) return;

  const highlighted = getHighlightedText();
  if (!highlighted) {
    // Show feedback: "Select text first"
    return;
  }

  // Clear selection visual
  window.getSelection()?.removeAllRanges();

  // Send to LLM with highlighted as the question
  sendCapturedQuestion(highlighted);
}
```

### Pattern 5: Message-Based LLM Request Flow
**What:** Content script sends capture to background, background fires LLM requests, streams results back to content script.
**When to use:** Always - keeps API keys in background, centralizes LLM logic.
**Example:**
```typescript
// Content script -> Background
interface LLMRequestMessage {
  type: 'LLM_REQUEST';
  question: string;        // Captured/highlighted text
  recentContext: string;   // Last N transcript entries
  fullTranscript: string;  // Entire session transcript
  templateId: string;      // Active template ID
}

// Background -> Content script (streaming updates)
interface LLMStreamMessage {
  type: 'LLM_STREAM';
  responseId: string;
  model: 'fast' | 'full';
  token: string;
}

interface LLMStatusMessage {
  type: 'LLM_STATUS';
  responseId: string;
  status: 'pending' | 'streaming' | 'complete' | 'error';
  error?: string;
}
```

### Anti-Patterns to Avoid
- **Making LLM calls from content script:** API keys would be exposed in page context, CSP issues.
- **Making LLM calls from Offscreen Document:** Unnecessarily complex, offscreen is for audio/WebSocket.
- **Blocking on fast response before starting full:** Both should fire simultaneously.
- **Using Promise.all instead of Promise.allSettled:** One failure shouldn't cancel the other.
- **Storing API keys in content script context:** Security risk - always use background.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Manual string parsing | eventsource-parser | Edge cases with multi-line data, comments, incomplete chunks |
| Hotkey parsing | Custom regex | Existing parseHotkey utility | Browser differences, modifier key handling |
| Stream cancellation | Manual cleanup | AbortController | Browser-native, works with fetch seamlessly |
| Text selection | Manual DOM traversal | window.getSelection() | Standard API handles all edge cases |

**Key insight:** SSE looks simple (just split on `data:`) but has many edge cases: incomplete chunks across reads, comment lines, retry directives, multi-line data fields. eventsource-parser handles all of these.

## Common Pitfalls

### Pitfall 1: Service Worker Suspension During Streaming
**What goes wrong:** Chrome MV3 service workers can suspend after 30 seconds of "inactivity". Long LLM responses may be interrupted.
**Why it happens:** Chrome considers a service worker inactive when not handling events, even during fetch.
**How to avoid:** The fetch itself keeps the service worker alive while streaming. Also send periodic keepalive messages to content script.
**Warning signs:** Responses cut off after ~30 seconds, especially for slow/long responses.
**Mitigation:**
```typescript
// Keep service worker alive during LLM streaming
let keepAliveInterval: NodeJS.Timeout | null = null;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    // Accessing chrome.runtime keeps service worker alive
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}
```

### Pitfall 2: Hotkey Conflicts with Google Meet
**What goes wrong:** Google Meet has its own keyboard shortcuts that may conflict.
**Why it happens:** Meet captures certain key combinations before our content script sees them.
**How to avoid:** Use uncommon key combinations (Ctrl+Shift+Space recommended). Document conflicts.
**Warning signs:** Hotkey doesn't trigger, or triggers Meet action instead.
**Mitigation:** Use `e.stopPropagation()` and `e.preventDefault()` early in event handler.

### Pitfall 3: Race Condition in Response State
**What goes wrong:** Fast and full responses update the same state object, causing lost updates.
**Why it happens:** React batching or non-atomic updates.
**How to avoid:** Use functional setState updates, or separate state for each stream.
**Warning signs:** Fast hint disappears when full answer starts streaming.
**Mitigation:**
```typescript
// BAD: Race condition
setResponse({ ...response, fastHint: response.fastHint + token });

// GOOD: Functional update
setResponse(prev => ({ ...prev, fastHint: (prev.fastHint || '') + token }));

// BETTER: Separate state
const [fastHint, setFastHint] = useState('');
const [fullAnswer, setFullAnswer] = useState('');
```

### Pitfall 4: Memory Leak from Unclosed Streams
**What goes wrong:** Stream readers not closed, abort controllers not triggered on unmount.
**Why it happens:** Component unmounts before stream completes, cleanup not handled.
**How to avoid:** Always abort in-flight requests on cleanup.
**Warning signs:** Memory usage grows over time, "already in use" errors.
**Mitigation:**
```typescript
useEffect(() => {
  const controller = new AbortController();

  // ... start request with controller.signal

  return () => {
    controller.abort(); // Cancel on unmount
  };
}, [dependencies]);
```

### Pitfall 5: Lost Keyup Events
**What goes wrong:** User presses hotkey, switches tabs/windows, releases key - keyup never fires.
**Why it happens:** Keyup fires in the window that has focus, not the original window.
**How to avoid:** Track focus state, reset capture state on blur.
**Warning signs:** Capture indicator stays on permanently.
**Mitigation:**
```typescript
useEffect(() => {
  const handleBlur = () => {
    if (isHolding) {
      // Reset state as if key was released
      setState({ isHolding: false, startTime: null });
    }
  };

  window.addEventListener('blur', handleBlur);
  return () => window.removeEventListener('blur', handleBlur);
}, [isHolding]);
```

## Code Examples

Verified patterns from official sources:

### OpenRouter Chat Completion Request
```typescript
// Source: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://your-site.com', // Optional for rankings
    'X-Title': 'Your App Name',              // Optional for rankings
  },
  body: JSON.stringify({
    model: 'google/gemini-flash-1.5', // or 'anthropic/claude-3-haiku'
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    stream: true,
    max_tokens: 150,
  }),
});
```

### eventsource-parser with ReadableStream
```typescript
// Source: https://github.com/rexxars/eventsource-parser

import { createParser, type EventSourceMessage } from 'eventsource-parser';

async function parseSSEStream(
  response: Response,
  onToken: (token: string) => void
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      if (event.data === '[DONE]') return;

      try {
        const json = JSON.parse(event.data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) onToken(content);
      } catch {
        // Ignore parse errors
      }
    },
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
}
```

### Chrome Commands API for Hotkey
```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/commands

// manifest.json
{
  "commands": {
    "capture-question": {
      "suggested_key": {
        "default": "Ctrl+Shift+Space",
        "mac": "Command+Shift+Space"
      },
      "description": "Capture question for AI assistance"
    }
  }
}

// background.ts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-question') {
    // Note: This only fires on key press, not hold detection
    // Hold detection still needs content script keydown/keyup
    notifyContentScript('CAPTURE_TRIGGER');
  }
});
```

### Prompt Variable Substitution (Existing)
```typescript
// Source: src/utils/promptSubstitution.ts (already in codebase)

import { substituteVariables, type PromptVariables } from '../utils/promptSubstitution';

const variables: PromptVariables = {
  highlighted: capturedQuestion,
  recent: last5Entries.map(e => `${e.speaker}: ${e.text}`).join('\n'),
  transcript: allEntries.map(e => `${e.speaker}: ${e.text}`).join('\n'),
};

const userPrompt = substituteVariables(template.userPromptTemplate, variables);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket for LLM | SSE streaming | 2023 | Simpler, HTTP-based, better caching |
| Single sequential request | Dual parallel streaming | 2024 | Faster time-to-first-token UX |
| OpenAI direct | OpenRouter routing | 2024 | Access to multiple models with one key |
| Polling for results | Server-sent events | Standard | Real-time token delivery |

**Deprecated/outdated:**
- Manifest V2 background pages: Replaced by MV3 service workers
- `onKeyPress` event: Deprecated, use `onKeyDown`/`onKeyUp`

## Open Questions

Things that couldn't be fully resolved:

1. **Model Selection for Fast vs Full**
   - What we know: Settings already has fastModel (google/gemini-flash-1.5) and fullModel (anthropic/claude-3-haiku)
   - What's unclear: Whether these are optimal choices for interview assistant use case
   - Recommendation: Use configured defaults, allow user override in settings. Monitor latency in practice.

2. **Exact Token Limit for Fast Hint**
   - What we know: Fast hint should be 1-2 sentences
   - What's unclear: Optimal max_tokens value (50? 100? 150?)
   - Recommendation: Start with 100, adjust based on actual response length

3. **Transcript Context Window Size**
   - What we know: Should include "recent" context for $recent variable
   - What's unclear: How many entries constitutes "recent" - last 5? Last 30 seconds?
   - Recommendation: Default to last 5 entries, make configurable if needed

4. **Chrome Commands API Limitations**
   - What we know: chrome.commands can't detect hold gesture, only key press
   - What's unclear: Whether we need chrome.commands at all, or just content script listeners
   - Recommendation: Use content script listeners for full control; chrome.commands is optional for global shortcuts when page doesn't have focus

## Sources

### Primary (HIGH confidence)
- [OpenRouter API Streaming Documentation](https://openrouter.ai/docs/api/reference/streaming) - SSE format, error handling
- [OpenRouter Chat Completions API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request) - Request schema
- [eventsource-parser GitHub](https://github.com/rexxars/eventsource-parser) - Parser API and usage
- [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands) - Extension hotkeys
- [MDN Window.getSelection()](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection) - Text selection API

### Secondary (MEDIUM confidence)
- [React key combination holding event pattern](https://www.createit.com/blog/key-combination-holding-event-in-react-3/) - Hold detection pattern
- [Chrome Service Worker streaming](https://developer.chrome.com/blog/sw-readablestreams) - ReadableStream in SW

### Tertiary (LOW confidence)
- Community discussions on OpenRouter latency - Model-specific performance varies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - OpenRouter docs are comprehensive, eventsource-parser is mature
- Architecture: HIGH - Patterns follow existing codebase architecture (background message handling)
- Pitfalls: MEDIUM - Some based on general Chrome extension experience, not LLM-specific testing
- Keyboard handling: MEDIUM - Chrome extension keyboard handling has edge cases

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - OpenRouter API is stable)
