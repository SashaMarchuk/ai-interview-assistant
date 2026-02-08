---
created: 2026-02-08
title: Usage Templates System
area: feature
priority: P0
version: v3.0
complexity: high
estimate: 5-6 days
files:
  - src/types/templates.ts
  - src/store/templatesStore.ts
  - src/components/settings/TemplatesSection.tsx
  - src/components/overlay/TemplateSelector.tsx
  - src/services/templates/templateManager.ts
---

## Problem

Different use cases (tech interviews, HR calls, sales demos, coaching) require different configurations of prompts, models, UI panels, and features. Users need ability to switch contexts quickly without manually reconfiguring everything.

## User Requirements

- **Pre-built templates:**
  1. Tech Interview (coding, system design) - default
  2. Recruiter/HR
  3. Sales/Demo
  4. Meeting/Generic
  5. Coach/Mentor (custom example)
  6. Form of Minds Detection (custom example)
- **Template controls:**
  - Prompts (Fast, Full, Reasoning, Quick)
  - Models (which models to use)
  - UI visibility (show/hide panels: Fast, Full, Reasoning, Transcript)
  - Feature toggles (files, context, speaker merging)
  - Hotkeys (custom per template)
- **UI features:**
  - Template selector in overlay header (dropdown)
  - Settings → Templates for management
  - "Apply template" → instant switch of all settings
  - Create custom templates from current config
  - Import/Export templates (JSON)

## Solution

### Architecture

1. **Template Schema**
   ```typescript
   interface UsageTemplate {
     id: string;
     name: string;
     description: string;
     isBuiltIn: boolean;
     icon?: string;

     prompts: {
       fast: string;
       full: string;
       reasoning: string;
       quick: string;
     };

     models: {
       fast: ModelId;
       full: ModelId;
       reasoning: ModelId;
     };

     ui: {
       showFast: boolean;
       showFull: boolean;
       showReasoning: boolean;
       showTranscript: boolean;
       layout?: 'default' | 'minimal' | 'split';
     };

     features: {
       useFiles: boolean;
       contextMode: boolean;
       speakerMerging: boolean;
       languageMode: 'auto' | 'manual';
       manualLanguage?: string;
     };

     hotkeys?: Record<string, string>; // action -> key binding

     metadata: {
       createdAt: number;
       updatedAt: number;
       usageCount?: number;
     };
   }
   ```

2. **Template Manager Service**
   - Load built-in templates
   - CRUD operations for custom templates
   - Apply template (update all stores)
   - Validate template before apply
   - Template migration for version updates

3. **Storage Strategy**
   - Built-in templates: Bundled in code
   - Custom templates: chrome.storage.sync
   - Active template ID: chrome.storage.local
   - Template history: Track last used

### Pre-built Templates

**1. Tech Interview (Default)**
```typescript
{
  name: "Tech Interview",
  description: "Optimized for coding and system design interviews",
  prompts: {
    fast: "You are an AI assistant helping with a technical interview. Provide concise, accurate answers focusing on coding concepts, algorithms, and system design. Reply in {language}.",
    full: "You are an expert technical interviewer assistant. Analyze the question deeply, provide comprehensive answers covering edge cases, time/space complexity, and best practices. Include code examples when relevant. Reply in {language}.",
    reasoning: "Think step-by-step about this technical question. Consider: 1) What concept is being tested, 2) Optimal approach, 3) Common mistakes, 4) Follow-up questions the interviewer might ask. Reply in {language}.",
    quick: "Explain this briefly for a technical interview. Reply in {language}."
  },
  models: {
    fast: 'gpt-4o-mini',
    full: 'o1',
    reasoning: 'o3-mini'
  },
  ui: {
    showFast: true,
    showFull: true,
    showReasoning: true,
    showTranscript: true
  },
  features: {
    useFiles: true, // Resume, job description
    contextMode: true,
    speakerMerging: true,
    languageMode: 'auto'
  }
}
```

**2. Recruiter/HR**
```typescript
{
  name: "Recruiter/HR",
  description: "For behavioral and cultural fit interviews",
  prompts: {
    fast: "You are helping with an HR interview. Focus on behavioral questions, STAR method responses, and cultural fit. Reply in {language}.",
    full: "Provide comprehensive answers for behavioral questions using the STAR method (Situation, Task, Action, Result). Include relevant examples from uploaded resume if available. Reply in {language}.",
    reasoning: "Analyze this behavioral question. What competency is being assessed? How to structure a strong STAR response? Reply in {language}.",
    quick: "Quick STAR format answer. Reply in {language}."
  },
  models: {
    fast: 'gpt-4o',
    full: 'gpt-4o',
    reasoning: 'o1-mini'
  },
  ui: {
    showFast: true,
    showFull: true,
    showReasoning: false, // Less needed for HR
    showTranscript: true
  },
  features: {
    useFiles: true, // Resume
    contextMode: true,
    speakerMerging: true,
    languageMode: 'auto'
  }
}
```

**3. Coach/Mentor**
```typescript
{
  name: "Coach/Mentor",
  description: "For learning sessions and mentoring conversations",
  prompts: {
    fast: "N/A", // Not used in this mode
    full: "You are a thoughtful mentor. Provide guidance, ask probing questions, and help the person think through their challenges. Focus on learning and growth. Reply in {language}.",
    reasoning: "Think deeply about this situation. What are the underlying issues? What questions would help them discover the answer themselves? Reply in {language}.",
    quick: "N/A"
  },
  models: {
    fast: 'gpt-4o-mini', // Not shown but available
    full: 'gpt-4o',
    reasoning: 'o1'
  },
  ui: {
    showFast: false, // Only Full panel
    showFull: true,
    showReasoning: true,
    showTranscript: true
  },
  features: {
    useFiles: false,
    contextMode: true,
    speakerMerging: true,
    languageMode: 'auto'
  }
}
```

**4. Sales/Demo**
```typescript
{
  name: "Sales/Demo",
  description: "For product demos and sales conversations",
  prompts: {
    fast: "Help with this sales conversation. Focus on value proposition, objection handling, and customer needs. Reply in {language}.",
    full: "Analyze this sales question. Suggest responses that address customer concerns, highlight benefits, and move the conversation forward. Reply in {language}.",
    reasoning: "Think about the customer's underlying need. What objection are they raising? How to reframe the conversation? Reply in {language}.",
    quick: "Quick sales talking point. Reply in {language}."
  },
  models: {
    fast: 'gpt-4o-mini',
    full: 'gpt-4o',
    reasoning: 'o1-mini'
  },
  ui: {
    showFast: true,
    showFull: true,
    showReasoning: true,
    showTranscript: true
  },
  features: {
    useFiles: true, // Product docs, sales materials
    contextMode: true,
    speakerMerging: true,
    languageMode: 'auto'
  }
}
```

**5. Meeting/Generic**
```typescript
{
  name: "Meeting/Generic",
  description: "General purpose for any conversation",
  prompts: {
    fast: "Provide a quick, helpful response. Reply in {language}.",
    full: "Analyze this question and provide a comprehensive answer. Reply in {language}.",
    reasoning: "Think step-by-step about this topic. Reply in {language}.",
    quick: "Brief answer. Reply in {language}."
  },
  models: {
    fast: 'gpt-4o-mini',
    full: 'gpt-4o',
    reasoning: 'o1-mini'
  },
  ui: {
    showFast: true,
    showFull: true,
    showReasoning: false,
    showTranscript: true
  },
  features: {
    useFiles: false,
    contextMode: false,
    speakerMerging: true,
    languageMode: 'auto'
  }
}
```

### Implementation Steps

1. **Define template system architecture**
   - Create UsageTemplate type
   - Design template manager service
   - Plan storage strategy

2. **Build template manager service**
   - Load built-in templates
   - CRUD for custom templates
   - Apply template logic (update all stores)
   - Validation

3. **Create templatesStore**
   - Active template tracking
   - Template list management
   - Recent templates history

4. **Build UI components**
   - Template selector dropdown (overlay header)
   - Templates settings section
   - Template editor (create/edit custom)
   - Template preview

5. **Implement apply template logic**
   - Update prompts store
   - Update models in settings
   - Update UI visibility toggles
   - Update feature flags
   - Update hotkeys (if specified)

6. **Add import/export**
   - JSON export format
   - Import validation
   - Share templates between users

7. **Testing & Polish**
   - Test all built-in templates
   - Test custom template creation
   - Test template switching
   - Performance optimization

### UI Components

**Overlay Header - Template Selector:**
```tsx
<Dropdown>
  <DropdownTrigger>
    <Button>
      {currentTemplate.icon} {currentTemplate.name} ▼
    </Button>
  </DropdownTrigger>
  <DropdownMenu>
    <DropdownSection title="Built-in">
      <DropdownItem>💻 Tech Interview</DropdownItem>
      <DropdownItem>👔 Recruiter/HR</DropdownItem>
      <DropdownItem>📊 Sales/Demo</DropdownItem>
      <DropdownItem>🎯 Coach/Mentor</DropdownItem>
      <DropdownItem>📝 Meeting/Generic</DropdownItem>
    </DropdownSection>
    <DropdownSection title="Custom">
      <DropdownItem>My Custom Template</DropdownItem>
    </DropdownSection>
    <DropdownDivider />
    <DropdownItem>⚙️ Manage Templates...</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

**Settings → Templates:**
- List of templates (built-in + custom)
- Template preview cards
- "Create New Template" button
- Edit/Delete/Duplicate actions
- Import/Export buttons
- "Save Current Config as Template" quick action

### Template Editor

Form with sections:
1. **Basic Info:** Name, description, icon
2. **Prompts:** Fast, Full, Reasoning, Quick (textarea each)
3. **Models:** Dropdowns for each
4. **UI Layout:** Checkboxes for panel visibility
5. **Features:** Toggle switches
6. **Hotkeys:** Optional custom key bindings

### Import/Export Format

```json
{
  "version": 1,
  "template": {
    "name": "My Custom Template",
    "description": "...",
    "prompts": { ... },
    "models": { ... },
    "ui": { ... },
    "features": { ... }
  }
}
```

### Integration Points

- **All v2.0 features:** File personalization, language detection, hotkeys
- **Settings store:** Update all relevant settings on template apply
- **Overlay UI:** Show/hide panels based on template
- **LLM service:** Use template-defined prompts and models

### Technical Notes

- **Template validation:** Ensure all required fields present before apply
- **Graceful degradation:** If template references non-existent model, fallback to default
- **Performance:** Template switching should be instant (<100ms)
- **Conflicts:** Warn if unsaved changes exist before switching templates
- **Migration:** Version templates for future schema changes

### Dependencies

- All v2.0 and v2.1 features must be stable
- Settings store refactoring may be needed
- UI components for template management

### Testing Checklist

- [ ] Load all built-in templates
- [ ] Switch between templates
- [ ] Create custom template
- [ ] Edit custom template
- [ ] Delete custom template
- [ ] Duplicate template
- [ ] Export template to JSON
- [ ] Import template from JSON
- [ ] Template validation works
- [ ] All settings update on template apply
- [ ] UI panels show/hide correctly
- [ ] Prompts use template values
- [ ] Models use template values
- [ ] Feature toggles work
- [ ] Hotkeys apply from template
- [ ] Template persistence across sessions
- [ ] "Save current as template" works
- [ ] Template preview accurate
- [ ] Performance is acceptable
- [ ] Handle invalid templates gracefully
