/**
 * TemplateManager Component
 *
 * Combined template management UI that renders the template list
 * and editor in a stacked layout optimized for the popup width.
 *
 * Layout:
 * - Top: TemplateList - Displays available templates with selection
 * - Bottom: TemplateEditor - Edits the selected template's properties
 *
 * Used in: popup/App.tsx Templates tab
 */

import { TemplateList } from './TemplateList';
import { TemplateEditor } from './TemplateEditor';

export function TemplateManager() {
  return (
    <div className="flex flex-col gap-4">
      {/* Template List - top section */}
      <div className="border-b pb-4">
        <TemplateList />
      </div>

      {/* Template Editor - bottom section */}
      <div>
        <TemplateEditor />
      </div>
    </div>
  );
}

export default TemplateManager;
