/**
 * TemplateList Component
 *
 * Displays a list of prompt templates with selection, creation, and deletion functionality.
 * Integrates with Zustand store for state management.
 */

import { useStore } from '../../store';
import type { TemplateType, NewTemplate } from '../../store/types';

/**
 * Badge color mapping for template types
 */
const TYPE_BADGE_COLORS: Record<TemplateType, string> = {
  'system-design': 'bg-purple-100 text-purple-800',
  coding: 'bg-green-100 text-green-800',
  behavioral: 'bg-orange-100 text-orange-800',
  custom: 'bg-gray-100 text-gray-800',
};

/**
 * Display labels for template types
 */
const TYPE_LABELS: Record<TemplateType, string> = {
  'system-design': 'System Design',
  coding: 'Coding',
  behavioral: 'Behavioral',
  custom: 'Custom',
};

export function TemplateList() {
  const templates = useStore((state) => state.templates);
  const activeTemplateId = useStore((state) => state.activeTemplateId);
  const setActiveTemplate = useStore((state) => state.setActiveTemplate);
  const deleteTemplate = useStore((state) => state.deleteTemplate);
  const addTemplate = useStore((state) => state.addTemplate);

  /**
   * Handle creating a new custom template
   */
  const handleAddTemplate = () => {
    const newTemplate: NewTemplate = {
      name: 'New Template',
      type: 'custom',
      systemPrompt: '',
      userPromptTemplate: 'Question: $highlighted\n\nContext: $recent',
      isDefault: false,
    };
    addTemplate(newTemplate);

    // Set the newly added template as active (it will be the last one)
    // We need to get the updated templates after adding
    const updatedTemplates = useStore.getState().templates;
    const newlyAdded = updatedTemplates[updatedTemplates.length - 1];
    if (newlyAdded) {
      setActiveTemplate(newlyAdded.id);
    }
  };

  /**
   * Handle deleting a template (non-default only)
   */
  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering selection
    deleteTemplate(id);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Templates</h3>

      {/* Template List */}
      <div className="space-y-1">
        {templates.map((template) => {
          const isActive = template.id === activeTemplateId;

          return (
            <div
              key={template.id}
              onClick={() => setActiveTemplate(template.id)}
              className={`
                flex items-center justify-between p-2 rounded cursor-pointer
                transition-colors duration-150
                ${isActive
                  ? 'bg-blue-50 border border-blue-300'
                  : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                }
              `}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Template Name */}
                <span
                  className={`text-sm truncate ${isActive ? 'font-semibold text-blue-900' : 'text-gray-800'}`}
                >
                  {template.name}
                </span>

                {/* Type Badge */}
                <span
                  className={`
                    text-xs px-1.5 py-0.5 rounded shrink-0
                    ${TYPE_BADGE_COLORS[template.type]}
                  `}
                >
                  {TYPE_LABELS[template.type]}
                </span>
              </div>

              {/* Delete Button (non-default only) */}
              {!template.isDefault && (
                <button
                  onClick={(e) => handleDelete(e, template.id)}
                  className="
                    ml-2 p-1 text-gray-400 hover:text-red-500
                    hover:bg-red-50 rounded transition-colors
                  "
                  title="Delete template"
                  aria-label="Delete template"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Template Button */}
      <button
        onClick={handleAddTemplate}
        className="
          w-full mt-2 p-2 text-sm text-blue-600
          border border-dashed border-blue-300 rounded
          hover:bg-blue-50 hover:border-blue-400
          transition-colors duration-150
          flex items-center justify-center gap-1
        "
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        New Template
      </button>
    </div>
  );
}

export default TemplateList;
