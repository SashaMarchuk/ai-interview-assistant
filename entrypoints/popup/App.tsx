/**
 * Popup Application Component
 *
 * Settings panel with tabbed navigation for configuring the extension.
 * Includes audio capture controls and settings interface.
 */

import { useState } from 'react';
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
  const [captureStatus, setCaptureStatus] = useState<string>('Idle');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('');

  // Get API keys from store
  const apiKeys = useStore((state) => state.apiKeys);

  /**
   * Start both tab and microphone capture
   */
  async function handleStartCapture() {
    setCaptureStatus('Starting...');
    setCaptureError(null);

    try {
      // Start tab audio capture
      const tabResponse = await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
      } as ExtensionMessage);

      if (!tabResponse?.success) {
        throw new Error(tabResponse?.error || 'Tab capture failed');
      }
      console.log('Tab capture started');

      // Start microphone capture
      const micResponse = await chrome.runtime.sendMessage({
        type: 'START_MIC_CAPTURE',
      } as ExtensionMessage);

      if (!micResponse?.success) {
        // Tab capture succeeded but mic failed - stop tab capture for clean state
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' } as ExtensionMessage);
        throw new Error(micResponse?.error || 'Microphone capture failed');
      }
      console.log('Mic capture started');

      setIsCapturing(true);
      setCaptureStatus('Capturing');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
    // Check if API key is set
    if (!apiKeys.elevenLabs) {
      setTranscriptionStatus('Set ElevenLabs API key in Settings tab');
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
                Starts tab audio and microphone capture. Check the Service Worker console for audio chunk logs.
              </p>
            </section>

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
                      : transcriptionStatus === 'Set ElevenLabs API key in Settings tab'
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
