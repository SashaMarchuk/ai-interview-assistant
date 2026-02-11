import { memo, useState, useMemo } from 'react';
import type { LLMResponse } from '../types/transcript';
import { MemoizedMarkdown } from '../components/markdown/MemoizedMarkdown';
import { ResponseAccordion } from './ResponseAccordion';

/**
 * Quick prompt response data from content script.
 * Each entry represents one quick prompt action result.
 */
export interface QuickPromptResponse {
  id: string;
  actionLabel: string;
  textSnippet: string;
  content: string;
  status: 'streaming' | 'complete' | 'error';
  error?: string;
  costUSD?: number;
}

interface ResponsePanelProps {
  /** History of main LLM responses, latest first */
  responseHistory: LLMResponse[];
  /** Quick prompt responses, latest first */
  quickPromptResponses?: QuickPromptResponse[];
  isReasoningPending?: boolean;
}

type AccordionType = 'fast' | 'full' | 'reasoning' | 'quick-prompt';

/** One open accordion ID per type — allows Fast+Full to be visible simultaneously */
type OpenByType = Record<AccordionType, string | null>;

const EMPTY_OPEN: OpenByType = { fast: null, full: null, reasoning: null, 'quick-prompt': null };

/**
 * Response panel with accordion-based history for all response types.
 *
 * Layout (top to bottom):
 * 1. Main responses (Fast/Full/Reasoning) — latest on top
 * 2. Quick prompt responses — latest on top
 *
 * Accordion behavior: one open per TYPE (fast, full, reasoning, quick-prompt).
 * Up to 4 can be visible simultaneously. New streaming response of the same
 * type auto-closes the previous one of that type.
 */
export const ResponsePanel = memo(function ResponsePanel({
  responseHistory,
  quickPromptResponses = [],
  isReasoningPending,
}: ResponsePanelProps) {
  const [openByType, setOpenByType] = useState<OpenByType>({ ...EMPTY_OPEN });
  const [prevStreamIds, setPrevStreamIds] = useState<Partial<Record<AccordionType, string | null>>>({});

  // Compute the currently streaming accordion ID per type
  const streamingByType = useMemo(() => {
    const result: Partial<Record<AccordionType, string>> = {};

    const latestMain = responseHistory[0];
    if (latestMain && (latestMain.status === 'streaming' || latestMain.status === 'pending')) {
      if (latestMain.isReasoning) {
        result.reasoning = `main-${latestMain.id}-reasoning`;
      } else {
        result.fast = `main-${latestMain.id}-fast`;
        result.full = `main-${latestMain.id}-full`;
      }
    }

    const latestQP = quickPromptResponses[0];
    if (latestQP?.status === 'streaming') {
      result['quick-prompt'] = `qp-${latestQP.id}`;
    }

    return result;
  }, [responseHistory, quickPromptResponses]);

  // React render-time state adjustment: auto-open new streaming responses per type
  const types: AccordionType[] = ['fast', 'full', 'reasoning', 'quick-prompt'];
  let needsUpdate = false;
  const nextOpen = { ...openByType };
  const nextPrev = { ...prevStreamIds };

  for (const t of types) {
    const cur = streamingByType[t] ?? null;
    if (cur !== (prevStreamIds[t] ?? null)) {
      nextPrev[t] = cur;
      if (cur) nextOpen[t] = cur;
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    setPrevStreamIds(nextPrev);
    setOpenByType(nextOpen);
  }

  const toggle = (type: AccordionType, id: string) => {
    setOpenByType((prev) => ({
      ...prev,
      [type]: prev[type] === id ? null : id,
    }));
  };

  const hasAnyContent = responseHistory.length > 0 || quickPromptResponses.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 text-xs font-medium text-white/60">AI Response</div>

      <div className="flex-1 space-y-1 overflow-y-auto rounded p-1">
        {!hasAnyContent ? (
          <div className="flex h-full items-center justify-center">
            <span className="px-4 text-center text-sm text-white/40 italic">
              {isReasoningPending ? 'Reasoning deeply...' : 'Hold hotkey to capture question...'}
            </span>
          </div>
        ) : (
          <>
            {/* Main LLM Responses — latest first */}
            {responseHistory.map((resp) => {
              const snippet = resp.questionSnippet || 'Transcript question';

              if (resp.isReasoning) {
                const accId = `main-${resp.id}-reasoning`;
                const label = `Reasoning (${resp.reasoningEffort || 'medium'})`;
                return (
                  <ResponseAccordion
                    key={accId}
                    type="reasoning"
                    label={label}
                    snippet={snippet}
                    isOpen={openByType.reasoning === accId}
                    onToggle={() => toggle('reasoning', accId)}
                    isStreaming={resp.status === 'streaming' || resp.status === 'pending'}
                    costUSD={resp.totalCostUSD}
                  >
                    {resp.status === 'error' ? (
                      <span className="text-red-300">{resp.error || 'An error occurred'}</span>
                    ) : resp.fullAnswer ? (
                      <MemoizedMarkdown content={resp.fullAnswer} />
                    ) : (
                      <span className="text-white/40 italic">Reasoning deeply...</span>
                    )}
                  </ResponseAccordion>
                );
              }

              // Standard response: separate Fast + Full accordions
              const fastId = `main-${resp.id}-fast`;
              const fullId = `main-${resp.id}-full`;
              return (
                <div key={`main-${resp.id}`} className="space-y-1">
                  {(resp.fastHint || resp.status === 'pending' || resp.status === 'streaming') && (
                    <ResponseAccordion
                      type="fast"
                      label="Fast"
                      snippet={snippet}
                      isOpen={openByType.fast === fastId}
                      onToggle={() => toggle('fast', fastId)}
                      isStreaming={resp.status === 'streaming' && !resp.fastHint}
                      costUSD={resp.fastCostUSD}
                    >
                      {resp.fastHint ? (
                        <MemoizedMarkdown content={resp.fastHint} />
                      ) : (
                        <span className="text-white/40 italic">Processing...</span>
                      )}
                    </ResponseAccordion>
                  )}

                  {(resp.fullAnswer || resp.status === 'streaming') && (
                    <ResponseAccordion
                      type="full"
                      label="Full"
                      snippet={snippet}
                      isOpen={openByType.full === fullId}
                      onToggle={() => toggle('full', fullId)}
                      isStreaming={resp.status === 'streaming'}
                      costUSD={resp.fullCostUSD}
                    >
                      {resp.status === 'error' ? (
                        <span className="text-red-300">{resp.error || 'An error occurred'}</span>
                      ) : resp.fullAnswer ? (
                        <MemoizedMarkdown content={resp.fullAnswer} />
                      ) : (
                        <span className="text-white/40 italic">Processing full answer...</span>
                      )}
                    </ResponseAccordion>
                  )}

                  {resp.status === 'error' && !resp.fastHint && !resp.fullAnswer && (
                    <div className="rounded border border-red-400/30 px-2 py-1.5 text-xs text-red-300">
                      Error: {resp.error || 'An error occurred'}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick Prompt Responses — latest first */}
            {quickPromptResponses.map((qp) => {
              const accId = `qp-${qp.id}`;
              return (
                <ResponseAccordion
                  key={accId}
                  type="quick-prompt"
                  label={qp.actionLabel}
                  snippet={qp.textSnippet}
                  isOpen={openByType['quick-prompt'] === accId}
                  onToggle={() => toggle('quick-prompt', accId)}
                  isStreaming={qp.status === 'streaming'}
                  costUSD={qp.costUSD}
                >
                  {qp.status === 'error' ? (
                    <span className="text-red-300">{qp.error || 'Request failed'}</span>
                  ) : qp.content ? (
                    <MemoizedMarkdown content={qp.content} />
                  ) : (
                    <span className="text-white/40 italic">Processing...</span>
                  )}
                </ResponseAccordion>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
});
