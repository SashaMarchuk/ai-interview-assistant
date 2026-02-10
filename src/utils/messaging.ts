/**
 * Safe Chrome extension messaging utilities.
 *
 * Handles "Extension context invalidated" errors gracefully —
 * these occur when the extension is reloaded but old content scripts
 * are still running on the page.
 */

const CONTEXT_INVALIDATED_PATTERN = /extension context invalidated/i;

/** Check whether the extension runtime context is still valid. */
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function isContextInvalidatedError(error: unknown): boolean {
  if (error instanceof Error) {
    return CONTEXT_INVALIDATED_PATTERN.test(error.message);
  }
  return CONTEXT_INVALIDATED_PATTERN.test(String(error));
}

/**
 * Result type for safeSendMessage with discriminated success/failure states.
 */
export type SafeMessageResult<T> =
  | { success: true; data: T; contextInvalid?: undefined; error?: undefined }
  | { success: false; data?: undefined; contextInvalid?: boolean; error?: string };

/**
 * Send a message via chrome.runtime.sendMessage with context-invalidation
 * protection. Returns a result object instead of throwing.
 *
 * @param message - Any object with at least a `type` property. Typed as
 *   `object` to accept both typed ExtensionMessage variants and ad-hoc
 *   message literals without requiring index signatures.
 */
export async function safeSendMessage<T = unknown>(message: object): Promise<SafeMessageResult<T>> {
  if (!isExtensionContextValid()) {
    return { success: false, contextInvalid: true, error: 'Extension context invalidated' };
  }

  try {
    const response = await chrome.runtime.sendMessage(message);
    return { success: true, data: response as T };
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      return { success: false, contextInvalid: true, error: 'Extension context invalidated' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wrap an onMessage listener so that context-invalidation errors in the
 * handler are caught and logged instead of surfacing as uncaught exceptions.
 */
export function safeMessageListener(
  handler: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void {
  return (message, sender, sendResponse) => {
    if (!isExtensionContextValid()) {
      console.warn('AI Interview Assistant: Message received but extension context is invalidated');
      return false;
    }
    try {
      return handler(message, sender, sendResponse);
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        console.warn(
          'AI Interview Assistant: Extension context invalidated during message handling',
        );
        return false;
      }
      throw error;
    }
  };
}
