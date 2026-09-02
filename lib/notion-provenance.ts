import type { AtlasNotionEditor } from "@/lib/api-types";

export function notionEditorName(editor: AtlasNotionEditor | null | undefined) {
  return editor?.displayName?.trim() || "Editor unavailable";
}

export function notionEditorAttribution(
  editor: AtlasNotionEditor | null | undefined,
  timestamp: string | null | undefined,
) {
  const name = notionEditorName(editor);
  const subject = name === "Editor unavailable" ? name : `Edited by ${name}`;
  const time = timestamp
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp))
    : "time unavailable";
  return `${subject} · ${time} · editor observed at sync`;
}
