/**
 * Language Settings Component
 *
 * Allows users to select transcription language for improved accuracy.
 * Uses ISO 639-3 language codes for ElevenLabs API.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';

/**
 * Supported languages for ElevenLabs transcription.
 * Codes are ISO 639-3 (3-letter).
 */
const LANGUAGES = [
  { code: '', label: 'Auto-detect', region: '' },
  // Common languages first
  { code: 'eng', label: 'English', region: '' },
  { code: 'spa', label: 'Spanish', region: '' },
  { code: 'fra', label: 'French', region: '' },
  { code: 'deu', label: 'German', region: '' },
  { code: 'por', label: 'Portuguese', region: '' },
  { code: 'ita', label: 'Italian', region: '' },
  { code: 'rus', label: 'Russian', region: '' },
  { code: 'ukr', label: 'Ukrainian', region: '' },
  { code: 'pol', label: 'Polish', region: '' },
  { code: 'nld', label: 'Dutch', region: '' },
  // Asian languages
  { code: 'zho', label: 'Mandarin Chinese', region: 'Asia' },
  { code: 'yue', label: 'Cantonese', region: 'Asia' },
  { code: 'jpn', label: 'Japanese', region: 'Asia' },
  { code: 'kor', label: 'Korean', region: 'Asia' },
  { code: 'hin', label: 'Hindi', region: 'Asia' },
  { code: 'ben', label: 'Bengali', region: 'Asia' },
  { code: 'tha', label: 'Thai', region: 'Asia' },
  { code: 'vie', label: 'Vietnamese', region: 'Asia' },
  { code: 'ind', label: 'Indonesian', region: 'Asia' },
  { code: 'msa', label: 'Malay', region: 'Asia' },
  { code: 'fil', label: 'Filipino', region: 'Asia' },
  // Middle East
  { code: 'ara', label: 'Arabic', region: 'Middle East' },
  { code: 'heb', label: 'Hebrew', region: 'Middle East' },
  { code: 'fas', label: 'Persian', region: 'Middle East' },
  { code: 'tur', label: 'Turkish', region: 'Middle East' },
  // European
  { code: 'ces', label: 'Czech', region: 'Europe' },
  { code: 'dan', label: 'Danish', region: 'Europe' },
  { code: 'fin', label: 'Finnish', region: 'Europe' },
  { code: 'ell', label: 'Greek', region: 'Europe' },
  { code: 'hun', label: 'Hungarian', region: 'Europe' },
  { code: 'nor', label: 'Norwegian', region: 'Europe' },
  { code: 'ron', label: 'Romanian', region: 'Europe' },
  { code: 'srp', label: 'Serbian', region: 'Europe' },
  { code: 'slk', label: 'Slovak', region: 'Europe' },
  { code: 'slv', label: 'Slovenian', region: 'Europe' },
  { code: 'swe', label: 'Swedish', region: 'Europe' },
  { code: 'cat', label: 'Catalan', region: 'Europe' },
  { code: 'hrv', label: 'Croatian', region: 'Europe' },
  { code: 'bul', label: 'Bulgarian', region: 'Europe' },
  // Other
  { code: 'afr', label: 'Afrikaans', region: 'Africa' },
  { code: 'swa', label: 'Swahili', region: 'Africa' },
] as const;

export default function LanguageSettings() {
  const transcriptionLanguage = useStore((state) => state.transcriptionLanguage);
  const setTranscriptionLanguage = useStore((state) => state.setTranscriptionLanguage);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!searchTerm.trim()) return LANGUAGES;
    const term = searchTerm.toLowerCase();
    return LANGUAGES.filter(
      (lang) =>
        lang.label.toLowerCase().includes(term) ||
        lang.code.toLowerCase().includes(term) ||
        lang.region.toLowerCase().includes(term),
    );
  }, [searchTerm]);

  // Get current language display name
  const currentLanguage = LANGUAGES.find((l) => l.code === transcriptionLanguage);
  const displayName = currentLanguage?.label || 'Auto-detect';

  const handleSelect = (code: string) => {
    setTranscriptionLanguage(code);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Transcription Language</label>
      <p className="mb-2 text-xs text-gray-500">
        Specify language for better accuracy, or use auto-detect
      </p>

      <div className="relative">
        {/* Selected value / Search input */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 transition-colors hover:border-gray-400"
        >
          <span className={transcriptionLanguage ? 'text-gray-900' : 'text-gray-500'}>
            {displayName}
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Dropdown - z-[100] to ensure it's above other UI elements */}
        {isOpen && (
          <div className="absolute z-[100] mt-1 max-h-60 w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg">
            {/* Search input */}
            <div className="border-b border-gray-200 p-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search languages..."
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* Language list */}
            <div className="max-h-48 overflow-y-auto">
              {filteredLanguages.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No languages found</div>
              ) : (
                filteredLanguages.map((lang) => (
                  <div
                    key={lang.code || 'auto'}
                    onClick={() => handleSelect(lang.code)}
                    className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-blue-50 ${
                      lang.code === transcriptionLanguage
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700'
                    }`}
                  >
                    <span>{lang.label}</span>
                    {lang.code && <span className="text-xs text-gray-400">{lang.code}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Backdrop to close dropdown when clicking outside - z-[99] is below dropdown z-[100] */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={() => {
            setIsOpen(false);
            setSearchTerm('');
          }}
        />
      )}
    </div>
  );
}
