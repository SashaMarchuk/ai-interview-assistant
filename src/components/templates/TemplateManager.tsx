/**
 * TemplateManager Component
 *
 * Combined template management UI that renders the template list
 * and editor in a stacked layout optimized for the popup width.
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
      <div className="overflow-y-auto">
        <TemplateEditor />
      </div>
    </div>
  );
}

export default TemplateManager;
