/**
 * Prompt Substitution Utility
 *
 * Handles variable substitution in prompt templates.
 * Replaces $variableName placeholders with actual values.
 */

/**
 * Variables available for prompt substitution
 */
export interface PromptVariables {
  /** Currently highlighted/captured question text */
  highlighted?: string;
  /** Recent transcript context from the conversation */
  recent?: string;
  /** Full transcript of the interview */
  transcript?: string;
  /** Allow additional custom variables */
  [key: string]: string | undefined;
}

/**
 * Substitute variables in a template string
 *
 * Replaces $variableName patterns with corresponding values from the variables object.
 * If a variable is not found in the object, the original $variable text is preserved.
 *
 * @param template - Template string containing $variable placeholders
 * @param variables - Object with variable values
 * @returns Template with variables substituted
 *
 * @example
 * ```ts
 * const template = "Question: $highlighted\nContext: $recent";
 * const result = substituteVariables(template, {
 *   highlighted: "What is your greatest strength?",
 *   recent: "The interviewer asked about teamwork earlier."
 * });
 * // Result: "Question: What is your greatest strength?\nContext: The interviewer asked about teamwork earlier."
 * ```
 */
export function substituteVariables(template: string, variables: PromptVariables): string {
  // Match $variableName patterns (word characters after $)
  const variablePattern = /\$(\w+)/g;

  return template.replace(variablePattern, (match, variableName: string) => {
    const value = variables[variableName];

    // If variable exists and has a value, substitute it
    // Otherwise, keep the original $variable text
    if (value !== undefined) {
      return value;
    }

    return match;
  });
}
