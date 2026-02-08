---
created: 2026-02-08
title: Cost Tracking Dashboard
area: feature
priority: P0
version: v2.0
complexity: medium
estimate: 2-3 days
files:
  - src/components/settings/UsageSection.tsx
  - src/services/analytics/costTracker.ts
  - src/store/usageStore.ts
  - src/types/usage.ts
---

## Problem

Users are cost-conscious and need visibility into API spending across ElevenLabs (transcription) and OpenAI (LLM). Currently, there's no way to track accumulated costs or understand usage patterns.

## User Requirements

- **Dashboard location:** Settings → Usage
- **Metrics to track:**
  1. Total cost per month (USD)
  2. Cost breakdown: ElevenLabs vs OpenAI
  3. Tokens used (input/output)
  4. Cost per session
- **Visualizations:** Charts for the last month
- **Alerts (optional):** Warnings when approaching user-defined limits

## Solution

### Architecture

1. **Cost Tracking Service**
   ```typescript
   interface APICallRecord {
     timestamp: number;
     provider: 'elevenlabs' | 'openai';
     service: 'transcription' | 'llm';
     usage: {
       // ElevenLabs
       charactersTranscribed?: number;
       // OpenAI
       tokensInput?: number;
       tokensOutput?: number;
       model?: string;
     };
     cost: number;
     sessionId: string;
   }

   interface UsageStats {
     monthlyTotal: number;
     breakdown: {
       elevenlabs: number;
       openai: number;
     };
     sessions: Record<string, number>; // sessionId -> cost
     dailyCosts: Record<string, number>; // YYYY-MM-DD -> cost
   }
   ```

2. **Storage Schema**
   - chrome.storage.local for usage records
   - Monthly aggregation to prevent unbounded growth
   - Archive old months after 12 months

3. **Cost Calculation**
   - **User-configurable pricing:**
     - Settings → Usage → Pricing Configuration
     - Default pricing from API docs
   - **ElevenLabs:** characters * price_per_1k_chars
   - **OpenAI:** (tokens_input * input_price + tokens_output * output_price) per model

4. **UI Components**
   - **Overview Cards:**
     - Total monthly cost
     - ElevenLabs total
     - OpenAI total
     - Total tokens this month
   - **Charts (Chart.js):**
     - Daily cost trend (line chart)
     - Provider breakdown (pie chart)
     - Session costs (bar chart, top 10)
   - **Filters:**
     - Last 7 days
     - Last 30 days
     - All time
   - **Session Details Table:**
     - Date, Duration, Cost, Provider breakdown

### Implementation Steps

1. Create usageStore (Zustand + webext-zustand)
2. Implement costTracker service
   - Hook into existing API call points (transcription, LLM)
   - Record usage metadata + calculate cost
3. Build UsageSection component
   - Install Chart.js dependency
   - Create chart components
   - Build stats cards
4. Add pricing configuration UI
5. Implement monthly aggregation background task
6. Add optional cost limit alerts

### Integration Points

- **ElevenLabs Service:** Track characters transcribed per API call
- **OpenAI Service:** Track tokens (input/output) and model used
- **Session Management:** Associate costs with session IDs for per-session tracking

### Technical Notes

- **Chart.js setup:**
  ```bash
  npm install chart.js react-chartjs-2
  ```
- **Storage optimization:** Aggregate daily costs to reduce storage size
- **Pricing updates:** Allow user to manually update pricing if API rates change
- **Export functionality (future):** CSV/JSON export of usage data

### Default Pricing (as of 2026-02-08)

- **ElevenLabs:** ~$0.30 per 1000 characters (verify current pricing)
- **OpenAI:**
  - GPT-4o: $2.50/$10.00 per 1M tokens (input/output)
  - GPT-4o-mini: $0.15/$0.60 per 1M tokens
  - o1: $15/$60 per 1M tokens
  - o3-mini: TBD (check docs)

### Dependencies

- Chart.js library
- Existing API call infrastructure
- chrome.storage.local

### Testing Checklist

- [ ] Track ElevenLabs API calls correctly
- [ ] Track OpenAI API calls (all models)
- [ ] Calculate costs accurately
- [ ] Monthly aggregation works
- [ ] Charts render properly
- [ ] Filters work (7d, 30d, all time)
- [ ] Session breakdown shows correct costs
- [ ] Pricing configuration persists
- [ ] Handle missing pricing data gracefully
- [ ] Cost limits alerts trigger correctly (optional)
