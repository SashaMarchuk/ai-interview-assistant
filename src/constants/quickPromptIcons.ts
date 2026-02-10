/**
 * Quick Prompt Icon Constants
 *
 * Shared icon mapping and options used by both the SelectionTooltip (overlay)
 * and QuickPromptSettings (popup) components.
 */

/** Icon key to emoji mapping for quick prompt action buttons */
export const ICON_MAP: Record<string, string> = {
  lightbulb: '\u{1F4A1}',
  expand: '\u{1F50D}',
  compress: '\u{1F4DD}',
  scales: '\u{2696}\u{FE0F}',
  brain: '\u{1F9E0}',
  rocket: '\u{1F680}',
  check: '\u{2705}',
  warning: '\u{26A0}\u{FE0F}',
  star: '\u{2B50}',
  wrench: '\u{1F527}',
  book: '\u{1F4DA}',
  chat: '\u{1F4AC}',
};

/** Icon option for the icon picker in settings UI */
export interface IconOption {
  key: string;
  emoji: string;
  label: string;
}

/** Predefined icon options for the icon picker */
export const ICON_OPTIONS: IconOption[] = [
  { key: 'lightbulb', emoji: '\u{1F4A1}', label: 'Lightbulb' },
  { key: 'expand', emoji: '\u{1F50D}', label: 'Magnify' },
  { key: 'compress', emoji: '\u{1F4DD}', label: 'Memo' },
  { key: 'scales', emoji: '\u{2696}\u{FE0F}', label: 'Scales' },
  { key: 'brain', emoji: '\u{1F9E0}', label: 'Brain' },
  { key: 'rocket', emoji: '\u{1F680}', label: 'Rocket' },
  { key: 'check', emoji: '\u{2705}', label: 'Check' },
  { key: 'warning', emoji: '\u{26A0}\u{FE0F}', label: 'Warning' },
  { key: 'star', emoji: '\u{2B50}', label: 'Star' },
  { key: 'wrench', emoji: '\u{1F527}', label: 'Wrench' },
  { key: 'book', emoji: '\u{1F4DA}', label: 'Books' },
  { key: 'chat', emoji: '\u{1F4AC}', label: 'Chat' },
];
