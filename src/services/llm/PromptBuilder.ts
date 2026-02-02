/**
 * Prompt Builder
 *
 * Builds prompts for dual-stream LLM requests by combining
 * request data with template patterns and variable substitution.
 */

import { substituteVariables, type PromptVariables } from '../../utils/promptSubstitution';
import type { PromptTemplate } from '../../store/types';
import type { DualLLMRequest } from './types';

/**
 * Result of building prompts for dual-stream request
 */
export interface BuildPromptResult {
  /** Substituted system prompt (same for both streams) */
  system: string;
  /** User prompt for fast hint (emphasizes brevity) */
  user: string;
  /** User prompt for full answer (comprehensive response) */
  userFull: string;
}

/** Instruction appended to fast hint user prompt */
const FAST_HINT_INSTRUCTION =
  '\n\nGive a 1-2 sentence answer. Use bullet points. No explanations, just the key facts.';

/** Instruction appended to full answer user prompt */
const FULL_ANSWER_INSTRUCTION =
  '\n\nProvide a focused, practical response. Include key points and a brief example if helpful. Keep it concise but complete.';

/**
 * Build prompts for dual-stream LLM request
 *
 * Takes a dual request (question + context) and a template, then
 * performs variable substitution to create ready-to-send prompts.
 *
 * The fast hint prompt emphasizes brevity for quick guidance,
 * while the full prompt requests comprehensive detail.
 *
 * @param request - The dual LLM request with question and context
 * @param template - The prompt template to use
 * @returns Substituted system and user prompts for both streams
 *
 * @example
 * ```ts
 * const result = buildPrompt(
 *   {
 *     question: 'How would you design Twitter?',
 *     recentContext: 'Interviewer: Let\'s do a system design question.',
 *     fullTranscript: '...',
 *     templateId: 'system-design-default',
 *   },
 *   template
 * );
 * // result.system: "You are a senior engineer helping with system design..."
 * // result.user: "Question: How would you design Twitter?\nContext: ..."
 * // result.userFull: "Question: How would you design Twitter?\nContext: ...\n\nProvide comprehensive..."
 * ```
 */
export function buildPrompt(request: DualLLMRequest, template: PromptTemplate): BuildPromptResult {
  // Build variables for substitution
  const variables: PromptVariables = {
    highlighted: request.question,
    recent: request.recentContext,
    transcript: request.fullTranscript,
  };

  // Substitute variables in system prompt (same for both)
  const system = substituteVariables(template.systemPrompt, variables);

  // Substitute variables in user prompt template
  const baseUserPrompt = substituteVariables(template.userPromptTemplate, variables);

  // Create fast hint prompt (emphasize brevity)
  const user = baseUserPrompt + FAST_HINT_INSTRUCTION;

  // Create full answer prompt (emphasize comprehensiveness)
  const userFull = baseUserPrompt + FULL_ANSWER_INSTRUCTION;

  return { system, user, userFull };
}
