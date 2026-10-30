export type PageLayout = Record<string, { order: number; span: number }>;
export const pageLayoutKey = (owner: string, page: string) =>
  `still-signal-page-layout-v1:${encodeURIComponent(owner)}:${encodeURIComponent(page)}`;
export function readPageLayout(value: string | null): PageLayout {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).slice(0, 200).filter(([key, value]) => {
      const row = value as PageLayout[string];
      return key.length < 600 && row && Number.isInteger(row.order) && row.order >= 0 && row.order < 200 &&
        Number.isInteger(row.span) && row.span >= 3 && row.span <= 12;
    })) as PageLayout;
  } catch { return {}; }
}
