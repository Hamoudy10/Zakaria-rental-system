import React from "react";

const TemplatePicker = ({
  label = "Template (Optional)",
  value = "",
  onChange,
  templates = [],
  loading = false,
  emptyLabel = "Use system default template",
  helpText,
  selectClassName = "w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none",
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={selectClassName}
      >
        <option value="">{emptyLabel}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} ({template.template_key})
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">
        {loading ? "Loading templates..." : helpText || ""}
      </p>
    </div>
  );
};

export default TemplatePicker;
