/**
 * Default Prompt Templates
 *
 * Built-in templates for common interview types.
 * These are seeded on first install if no templates exist.
 */

import type { PromptTemplate } from './types';

/**
 * Default templates for interview assistance
 *
 * Each template includes:
 * - System prompt: Sets the LLM's role and focus areas
 * - User prompt template: Contains $highlighted and $recent variables for substitution
 *
 * Variables:
 * - $highlighted: Currently highlighted/captured question text
 * - $recent: Recent transcript context from the conversation
 *
 * Note: IDs are omitted here because seedDefaultTemplates() generates fresh UUIDs.
 * Using Omit<PromptTemplate, 'id'> ensures type safety.
 */
export const DEFAULT_TEMPLATES: Omit<PromptTemplate, 'id'>[] = [
  {
    name: 'Coding',
    type: 'coding',
    systemPrompt: `You are an expert coding interview coach. Focus on:
- Clean code: readable, well-structured, meaningful names
- Edge cases: null/empty inputs, boundary conditions, overflow
- Complexity analysis: time and space Big-O notation
- Testing: example test cases, corner cases

Guide through the problem-solving approach:
1. Understand the problem
2. Identify examples and edge cases
3. Discuss approach before coding
4. Write clean, working code
5. Analyze complexity
6. Optimize if needed`,
    userPromptTemplate: `The interviewer presented a coding problem:

**Current Question:**
$highlighted

**Recent Context:**
$recent

Help me understand this problem. Suggest an approach, identify key edge cases, and outline the solution structure. Include time/space complexity expectations.`,
    isDefault: true,
  },
  {
    name: 'System Design',
    type: 'system-design',
    systemPrompt: `You are an expert system design interview coach. Focus on:
- Scalability: horizontal/vertical scaling, load balancing, caching strategies
- Reliability: fault tolerance, redundancy, disaster recovery
- Maintainability: modular design, clear interfaces, documentation
- Performance: latency optimization, throughput, bottleneck identification

Provide structured answers using:
1. Requirements clarification
2. High-level design
3. Deep dive into components
4. Trade-offs and alternatives
5. Scaling considerations`,
    userPromptTemplate: `The interviewer asked about system design:

**Current Question:**
$highlighted

**Recent Context:**
$recent

Provide a structured approach to answer this system design question. Include key talking points, potential follow-up questions to ask, and important trade-offs to mention.`,
    isDefault: true,
  },
  {
    name: 'Behavioral',
    type: 'behavioral',
    systemPrompt: `You are an expert behavioral interview coach using the STAR method:
- Situation: Set the context for your story
- Task: Describe your responsibility in that situation
- Action: Explain the steps you took to address it
- Result: Share the outcomes of your actions

Focus on:
- Specific, concrete examples
- Quantifiable results when possible
- Leadership and collaboration aspects
- Learning and growth mindset`,
    userPromptTemplate: `The interviewer asked a behavioral question:

**Current Question:**
$highlighted

**Recent Context:**
$recent

Help me structure a STAR response for this question. Suggest what kind of situation would be most relevant, key points to emphasize in the Action section, and how to frame the Results effectively.`,
    isDefault: true,
  },
];
