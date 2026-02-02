/**
 * Health Indicator Component
 *
 * Displays service health issues at the top of the overlay.
 * Only renders when there are issues to display (per CONTEXT.md:
 * "Health indicator: Only visible when there are issues").
 */

export type HealthIssue = {
  service: string;
  status: 'warning' | 'error' | 'reconnecting';
  message: string;
};

interface HealthIndicatorProps {
  issues: HealthIssue[];
}

/**
 * Get styling classes based on issue status
 */
function getStatusStyles(status: HealthIssue['status']): {
  bg: string;
  text: string;
  dot: string;
  animate: boolean;
} {
  switch (status) {
    case 'warning':
      return {
        bg: 'bg-yellow-500/90',
        text: 'text-yellow-100',
        dot: 'bg-yellow-200',
        animate: false,
      };
    case 'error':
      return {
        bg: 'bg-red-500/90',
        text: 'text-red-100',
        dot: 'bg-red-200',
        animate: false,
      };
    case 'reconnecting':
      return {
        bg: 'bg-blue-500/90',
        text: 'text-blue-100',
        dot: 'bg-blue-200',
        animate: true,
      };
  }
}

/**
 * Health indicator component for displaying service status issues.
 * Renders a stacked list of issues at the top of the overlay.
 * Returns null when no issues (clean UI when everything works).
 */
export function HealthIndicator({ issues }: HealthIndicatorProps) {
  // Don't render when no issues - keeps UI clean
  if (!issues.length) {
    return null;
  }

  return (
    <div className="overlay-drag-handle absolute top-0 left-0 right-0 z-20 flex flex-col cursor-move">
      {issues.map((issue, index) => {
        const styles = getStatusStyles(issue.status);
        return (
          <div
            key={`${issue.service}-${index}`}
            className={`${styles.bg} px-3 py-1.5 flex items-center gap-2 text-xs font-medium ${styles.text} select-none`}
          >
            {/* Status dot with optional pulse animation */}
            <span className="relative flex h-2 w-2">
              {styles.animate && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full ${styles.dot} opacity-75`}
                ></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`}
              ></span>
            </span>

            {/* Compact message format: "Service: message" */}
            <span>
              {issue.service}: {issue.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
