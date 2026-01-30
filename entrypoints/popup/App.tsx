/**
 * Popup Application Component
 *
 * Settings panel with tabbed navigation for configuring the extension.
 * Includes audio capture controls and settings interface.
 */

import { useState, useEffect } from 'react';
import type { ExtensionMessage } from '../../src/types/messages';
import { useStore } from '../../src/store';
import ApiKeySettings from '../../src/components/settings/ApiKeySettings';
import ModelSettings from '../../src/components/settings/ModelSettings';
import HotkeySettings from '../../src/components/settings/HotkeySettings';
import BlurSettings from '../../src/components/settings/BlurSettings';
import TemplateManager from '../../src/components/templates/TemplateManager';

type Tab = 'capture' | 'settings' | 'templates';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('capture');

  // Audio capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string>('Loading...');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('');

  // Query capture state on mount to sync with background
  useEffect(() => {
    async function syncCaptureState() {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_CAPTURE_STATE',
        } as ExtensionMessage);

        console.log('Got capture state:', response);

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
      } catch (error) {
        console.error('Failed to get capture state:', error);
        setCaptureStatus('Idle');
      }
    }

    syncCaptureState();
  }, []);

  // Get API keys from store
  const apiKeys = useStore((state) => state.apiKeys);

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
      console.log('Sending START_CAPTURE...');
      const tabResponse = await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
      } as ExtensionMessage);

      console.log('START_CAPTURE response:', tabResponse);
      if (!tabResponse?.success) {
        const errorMsg = typeof tabResponse?.error === 'string'
          ? tabResponse.error
          : 'Tab capture failed - unknown error';
        throw new Error(errorMsg);
      }
      console.log('Tab capture started');

      // Step 3: Start microphone capture
      setCaptureStatus('Starting mic capture...');
      console.log('Sending START_MIC_CAPTURE...');
      const micResponse = await chrome.runtime.sendMessage({
        type: 'START_MIC_CAPTURE',
      } as ExtensionMessage);

      console.log('START_MIC_CAPTURE response:', micResponse);
      if (!micResponse?.success) {
        // Tab capture succeeded but mic failed - stop tab capture for clean state
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' } as ExtensionMessage);
        const errorMsg = typeof micResponse?.error === 'string'
          ? micResponse.error
          : 'Microphone capture failed - unknown error';
        throw new Error(errorMsg);
      }
      console.log('Mic capture started');

      setIsCapturing(true);
      setCaptureStatus('Capturing');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';
      console.error('Capture error:', errorMessage);
      setCaptureStatus('Error');
      setCaptureError(errorMessage);
      setIsCapturing(false);
    }
  }

  /**
   * Stop both tab and microphone capture
   */
  async function handleStopCapture() {
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
      console.log('Tab capture stopped');

      // Stop microphone capture
      await chrome.runtime.sendMessage({
        type: 'STOP_MIC_CAPTURE',
      } as ExtensionMessage);
      console.log('Mic capture stopped');

      setIsCapturing(false);
      setCaptureStatus('Idle');
      setCaptureError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Stop capture error:', errorMessage);
      setCaptureStatus('Error');
      setCaptureError(errorMessage);
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
      } as ExtensionMessage);

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start transcription');
      }

      setIsTranscribing(true);
      setTranscriptionStatus('Transcribing...');
      console.log('Transcription started');
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
      console.log('Transcription stopped');
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
                <div
                  className={`w-2 h-2 rounded-full ${
                    captureStatus === 'Capturing'
                      ? 'bg-green-500 animate-pulse'
                      : captureStatus === 'Error'
                      ? 'bg-red-500'
                      : captureStatus === 'Starting...' || captureStatus === 'Stopping...'
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-gray-400'
                  }`}
                />
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
