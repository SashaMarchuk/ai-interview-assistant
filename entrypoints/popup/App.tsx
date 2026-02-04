/**
 * Popup Application Component
 *
 * Settings panel with tabbed navigation for configuring the extension.
 * Includes audio capture controls and settings interface.
 */

import { useState, useEffect, useRef } from 'react';
import type { ExtensionMessage } from '../../src/types/messages';
import { useStore } from '../../src/store';
import ApiKeySettings from '../../src/components/settings/ApiKeySettings';
import ModelSettings from '../../src/components/settings/ModelSettings';
import HotkeySettings from '../../src/components/settings/HotkeySettings';
import BlurSettings from '../../src/components/settings/BlurSettings';
import LanguageSettings from '../../src/components/settings/LanguageSettings';
import TemplateManager from '../../src/components/templates/TemplateManager';

type Tab = 'capture' | 'settings' | 'templates';

// Polling interval for state sync (increased to reduce flickering)
const SYNC_INTERVAL_MS = 2000;

/**
 * Get status indicator color class based on capture status.
 * Uses a clear switch statement instead of nested ternaries.
 */
function getStatusColorClass(status: string): string {
  switch (status) {
    case 'Capturing':
      return 'bg-green-500 animate-pulse';
    case 'Error':
      return 'bg-red-500';
    case 'Starting...':
    case 'Stopping...':
      return 'bg-yellow-500 animate-pulse';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Status indicator dot component.
 */
function StatusDot({ status }: { status: string }): React.JSX.Element {
  return <div className={`w-2 h-2 rounded-full ${getStatusColorClass(status)}`} />;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('capture');

  // Audio capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string>('Loading...');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('');

  // LLM request state
  const [hasActiveLLMRequest, setHasActiveLLMRequest] = useState(false);

  // Ref to track if a capture operation is in flight (synchronous check)
  // This prevents race conditions where async state updates cause flickering
  const captureOperationInFlight = useRef(false);
  const stopOperationInFlight = useRef(false);

  // Query capture state on mount and periodically to sync with background
  useEffect(() => {
    async function syncCaptureState() {
      // Skip sync if any operation is in flight to prevent race conditions
      // This is critical: refs are synchronous, React state is async
      if (captureOperationInFlight.current || stopOperationInFlight.current) {
        return;
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_CAPTURE_STATE',
        } as ExtensionMessage);

        // Also skip if background reports capture start in progress
        // This handles the case where background is still processing START_CAPTURE
        if (response?.isCaptureStartInProgress) {
          return;
        }

        // Double-check refs again after async call (operation might have started during await)
        if (captureOperationInFlight.current || stopOperationInFlight.current) {
          return;
        }

        if (response?.isCapturing) {
          setIsCapturing(true);
          setCaptureStatus('Capturing');
        } else {
          setIsCapturing(false);
          setCaptureStatus('Idle');
        }

        if (response?.isTranscribing) {
          setIsTranscribing(true);
          setTranscriptionStatus('Transcribing...');
        } else {
          setIsTranscribing(false);
        }

        // Track LLM request state
        setHasActiveLLMRequest(response?.hasActiveLLMRequest || false);
      } catch (error) {
        console.error('Failed to get capture state:', error);
        // Only update status if no operation is in flight
        if (!captureOperationInFlight.current && !stopOperationInFlight.current) {
          setCaptureStatus('Idle');
        }
      }
    }

    // Sync immediately on mount
    syncCaptureState();

    // Also sync periodically to catch state changes while popup is open
    // Using longer interval to reduce flickering and race conditions
    const interval = setInterval(syncCaptureState, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Get API keys and transcription settings from store
  const apiKeys = useStore((state) => state.apiKeys);
  const transcriptionLanguage = useStore((state) => state.transcriptionLanguage);

  /**
   * Open the permissions page to grant microphone access
   */
  async function openPermissionsPage() {
    const url = chrome.runtime.getURL('permissions.html');
    await chrome.tabs.create({ url });
  }

  /**
   * Check if we're on a valid page for capture
   */
  async function checkActivePage(): Promise<{ valid: boolean; tabId?: number; error?: string }> {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !activeTab.url) {
      return { valid: false, error: 'No active tab found' };
    }

    // Check for chrome:// or other restricted pages
    if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
      return { valid: false, error: 'Cannot capture Chrome internal pages. Navigate to a regular website.' };
    }

    return { valid: true, tabId: activeTab.id };
  }

  /**
   * Start both tab and microphone capture
   * Proceeds even without API keys (graceful degradation per CONTEXT.md)
   */
  async function handleStartCapture() {
    // Use ref for synchronous check - React state updates are async and can race
    if (captureOperationInFlight.current) {
      return;
    }

    // Also check React state as secondary guard
    if (isCapturing || captureStatus === 'Starting...') {
      return;
    }

    // Set ref IMMEDIATELY before any async work to prevent race conditions
    captureOperationInFlight.current = true;

    setCaptureStatus('Starting...');
    setCaptureError(null);

    // Log warnings for missing keys but don't block capture
    if (!apiKeys.elevenLabs) {
      console.warn('Starting capture without ElevenLabs API key - transcription will be unavailable');
    }
    if (!apiKeys.openRouter && !apiKeys.openAI) {
      console.warn('Starting capture without OpenRouter or OpenAI API key - AI responses will be unavailable');
    }

    try {
      // Step 1: Validate we're on a capturable page
      const pageCheck = await checkActivePage();
      if (!pageCheck.valid) {
        throw new Error(pageCheck.error || 'Invalid page for capture');
      }

      // Step 2: Start tab audio capture
      setCaptureStatus('Starting tab capture...');
      const tabResponse = await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
      } as ExtensionMessage);

      if (!tabResponse?.success) {
        const errorMsg = typeof tabResponse?.error === 'string'
          ? tabResponse.error
          : 'Tab capture failed';
        throw new Error(errorMsg);
      }

      // Step 3: Start microphone capture
      setCaptureStatus('Starting mic capture...');
      const micResponse = await chrome.runtime.sendMessage({
        type: 'START_MIC_CAPTURE',
      } as ExtensionMessage);

      if (!micResponse?.success) {
        // Tab capture succeeded but mic failed - stop tab capture for clean state
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' } as ExtensionMessage);
        const errorMsg = typeof micResponse?.error === 'string'
          ? micResponse.error
          : 'Microphone capture failed';
        throw new Error(errorMsg);
      }

      setIsCapturing(true);
      setCaptureStatus('Capturing');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';
      console.error('Capture error:', errorMessage);
      setCaptureStatus('Error');
      setCaptureError(errorMessage);
      setIsCapturing(false);
    } finally {
      // Always clear the in-flight flag when operation completes
      captureOperationInFlight.current = false;
    }
  }

  /**
   * Stop both tab and microphone capture
   */
  async function handleStopCapture() {
    // Use ref for synchronous check to prevent race conditions
    if (stopOperationInFlight.current) {
      return;
    }

    // Set ref IMMEDIATELY before any async work
    stopOperationInFlight.current = true;

    setCaptureStatus('Stopping...');

    try {
      // Stop transcription first if running
      if (isTranscribing) {
        await handleStopTranscription();
      }

      // Stop tab capture
      await chrome.runtime.sendMessage({
        type: 'STOP_CAPTURE',
      } as ExtensionMessage);

      // Stop microphone capture
      await chrome.runtime.sendMessage({
        type: 'STOP_MIC_CAPTURE',
      } as ExtensionMessage);

      setIsCapturing(false);
      setCaptureStatus('Idle');
      setCaptureError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Stop capture error:', errorMessage);
      setCaptureStatus('Error');
      setCaptureError(errorMessage);
    } finally {
      // Always clear the in-flight flag when operation completes
      stopOperationInFlight.current = false;
    }
  }

  /**
   * Start transcription with ElevenLabs
   */
  async function handleStartTranscription() {
    // Check if API key is set - clearer message with direction to settings
    if (!apiKeys.elevenLabs) {
      setTranscriptionStatus('ElevenLabs API key required - configure in Settings');
      return;
    }

    setTranscriptionStatus('Starting...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_TRANSCRIPTION',
        apiKey: apiKeys.elevenLabs,
        languageCode: transcriptionLanguage || undefined,
      } as ExtensionMessage);

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start transcription');
      }

      setIsTranscribing(true);
      setTranscriptionStatus('Transcribing...');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Transcription error:', errorMessage);
      setTranscriptionStatus('Failed: ' + errorMessage);
      setIsTranscribing(false);
    }
  }

  /**
   * Stop transcription
   */
  async function handleStopTranscription() {
    try {
      await chrome.runtime.sendMessage({
        type: 'STOP_TRANSCRIPTION',
      } as ExtensionMessage);

      setIsTranscribing(false);
      setTranscriptionStatus('Stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Stop transcription error:', errorMessage);
      setTranscriptionStatus('Error: ' + errorMessage);
    }
  }

  return (
    <div className="w-96 bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">AI Interview Assistant</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('capture')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'capture'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Capture
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Templates
        </button>
      </div>

      {/* Tab Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {activeTab === 'capture' && (
          <div className="p-4 space-y-4">
            {/* Audio Capture Section */}
            <section className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Audio Capture</h2>

              {/* Status Display */}
              <div className="flex items-center gap-2 mb-4">
                <StatusDot status={captureStatus} />
                <span className="text-sm text-gray-700">
                  Status: <span className="font-medium">{captureStatus}</span>
                </span>
              </div>

              {/* Error Display */}
              {captureError && (
                <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {captureError}
                </div>
              )}

              {/* Capture Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleStartCapture}
                  disabled={isCapturing || captureStatus === 'Starting...'}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    isCapturing || captureStatus === 'Starting...'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                  }`}
                >
                  Start
                </button>
                <button
                  onClick={handleStopCapture}
                  disabled={!isCapturing || captureStatus === 'Stopping...'}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    !isCapturing || captureStatus === 'Stopping...'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                  }`}
                >
                  Stop
                </button>
              </div>

              {/* Help Text */}
              <p className="mt-3 text-xs text-gray-500">
                Starts tab audio and microphone capture.
              </p>

              {/* First-time setup */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">
                  First time? Grant microphone permission:
                </p>
                <button
                  onClick={openPermissionsPage}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Open Permission Setup
                </button>
              </div>
            </section>

            {/* API Key Warnings Section - non-blocking, informational */}
            {(!apiKeys.elevenLabs || (!apiKeys.openRouter && !apiKeys.openAI)) && (
              <section className="space-y-2">
                {!apiKeys.elevenLabs && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <div className="text-yellow-600 text-sm">
                      <span className="font-medium">Missing ElevenLabs API key</span>
                      <span className="text-yellow-500"> - transcription unavailable</span>
                    </div>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="ml-auto text-xs text-yellow-700 hover:text-yellow-900 underline whitespace-nowrap"
                    >
                      Configure
                    </button>
                  </div>
                )}
                {!apiKeys.openRouter && !apiKeys.openAI && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <div className="text-yellow-600 text-sm">
                      <span className="font-medium">Missing LLM API key</span>
                      <span className="text-yellow-500"> - AI responses unavailable</span>
                    </div>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="ml-auto text-xs text-yellow-700 hover:text-yellow-900 underline whitespace-nowrap"
                    >
                      Configure
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Transcription Section */}
            <section className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Transcription</h2>

              {/* Transcription Button */}
              <button
                onClick={isTranscribing ? handleStopTranscription : handleStartTranscription}
                disabled={!isCapturing}
                className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  !isCapturing
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isTranscribing
                    ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                    : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                }`}
              >
                {isTranscribing ? 'Stop Transcription' : 'Start Transcription'}
              </button>

              {/* Status/Error Display */}
              {transcriptionStatus && (
                <p
                  className={`mt-2 text-xs ${
                    transcriptionStatus.startsWith('Failed') || transcriptionStatus.startsWith('Error')
                      ? 'text-red-600'
                      : transcriptionStatus.includes('API key required')
                      ? 'text-yellow-600'
                      : 'text-gray-500'
                  }`}
                >
                  {transcriptionStatus}
                </p>
              )}

              {/* Requirement Warning */}
              {!isCapturing && (
                <p className="mt-2 text-xs text-yellow-600">
                  Start audio capture first
                </p>
              )}
            </section>

            {/* Active LLM Request Indicator */}
            {hasActiveLLMRequest && (
              <section className="border border-blue-200 bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-medium text-blue-700">LLM Request Active</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  AI is processing your request...
                </p>
              </section>
            )}

            {/* Quick Info */}
            <section className="text-xs text-gray-500 space-y-1">
              <p>
                <strong>Tab Audio:</strong> Captures interviewer's voice from the current tab
              </p>
              <p>
                <strong>Microphone:</strong> Captures your voice for transcription
              </p>
            </section>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 space-y-6">
            {/* API Keys Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">API Keys</h2>
              <ApiKeySettings />
            </section>

            {/* Transcription Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Transcription</h2>
              <LanguageSettings />
            </section>

            {/* Models Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Models</h2>
              <ModelSettings />
            </section>

            {/* Hotkeys Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Hotkeys</h2>
              <HotkeySettings />
            </section>

            {/* Appearance Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Appearance</h2>
              <BlurSettings />
            </section>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="p-4">
            <TemplateManager />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200">
        <div className="text-xs text-gray-400">v0.2.0 - Audio Capture</div>
      </div>
    </div>
  );
}

export default App;
