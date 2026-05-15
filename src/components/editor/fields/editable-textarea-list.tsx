'use client';

import { Textarea } from '@/components/ui/textarea';

interface EditableTextareaListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  rows?: number;
}

export function EditableTextareaList({ label, items, onChange, placeholder, rows = 4 }: EditableTextareaListProps) {
  // Convert array to multiline text for display
  const textValue = (items || []).join('\n');

  // Convert multiline text back to array
  const handleChange = (text: string) => {
    const newItems = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    onChange(newItems);
  };

  const itemCount = (items || []).filter((item) => item.trim().length > 0).length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
        {itemCount > 0 && (
          <span className="text-xs text-zinc-400">共 {itemCount} 条</span>
        )}
      </div>
      <Textarea
        value={textValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || '每行输入一条内容...'}
        rows={rows}
        className="text-sm resize-none"
      />
    </div>
  );
}
