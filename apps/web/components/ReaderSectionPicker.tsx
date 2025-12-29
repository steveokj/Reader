"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

type Section = {
  id: number;
  section_key: string;
  title?: string | null;
};

type ReaderSectionPickerProps = {
  documentId: number;
  sections: Section[];
  activeKey?: string | null;
};

export default function ReaderSectionPicker({
  documentId,
  sections,
  activeKey,
}: ReaderSectionPickerProps) {
  const router = useRouter();
  const options = useMemo(() => {
    return sections.map((section, index) => ({
      key: section.section_key,
      label: section.title?.trim() || `Section ${index + 1}`,
    }));
  }, [sections]);

  if (options.length <= 1) {
    return null;
  }

  const optionKeys = useMemo(() => new Set(options.map((option) => option.key)), [options]);
  const selected =
    activeKey && optionKeys.has(activeKey) ? activeKey : options[0]?.key ?? "";

  return (
    <div className="reader-section-picker">
      <label className="reader-section-picker__label" htmlFor="reader-section-select">
        Chapter
      </label>
      <select
        id="reader-section-select"
        className="reader-section-picker__select"
        value={selected}
        onChange={(event) => {
          const nextKey = event.target.value;
          router.push(`/books/${documentId}?sectionKey=${encodeURIComponent(nextKey)}`);
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
