// Overlay module barrel export
export { Overlay } from './Overlay';
export { OverlayHeader } from './OverlayHeader';
export { TranscriptPanel } from './TranscriptPanel';
export { ResponsePanel } from './ResponsePanel';
export { CaptureIndicator } from './CaptureIndicator';
export { HealthIndicator } from './HealthIndicator';
export type { HealthIssue } from './HealthIndicator';

// Re-export hooks for convenience
export { useOverlayPosition } from './hooks/useOverlayPosition';
export { useAutoScroll } from './hooks/useAutoScroll';
