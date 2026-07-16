import { Card, CardContent } from "@/components/ui/card";

interface ShortcutEntry {
  keys: string[];
  label: string;
}

const QUEUE_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["j", "k"], label: "next / prev job" },
  { keys: ["a"], label: "approve" },
  { keys: ["r"], label: "reject" },
];

const FINDING_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["n", "p"], label: "next / prev finding" },
  { keys: ["o"], label: "override" },
  { keys: ["c"], label: "correct" },
  { keys: ["v"], label: "view on PDF" },
  { keys: ["w"], label: "waive" },
  { keys: ["y"], label: "approve / confirm pair" },
  { keys: ["⌘", "Enter"], label: "confirm override" },
];

const META_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["Enter"], label: "focus pane" },
  { keys: ["?"], label: "toggle this legend" },
];

function ShortcutItem({ entry }: { entry: ShortcutEntry }) {
  const joiner =
    entry.keys.length > 1 && entry.keys.includes("Enter") ? " + " : " / ";
  return (
    <span>
      {entry.keys.map((k, i) => (
        <span key={k}>
          {i > 0 && joiner}
          <kbd className="font-mono text-foreground">{k}</kbd>
        </span>
      ))}{" "}
      {entry.label}
    </span>
  );
}

export type ReviewShortcutsLegendVariant = "queue" | "workstation" | "list";

interface ReviewShortcutsLegendProps {
  /** "queue" shows queue + finding shortcuts; "workstation" finding-only; "list" j/k/Enter. */
  variant: ReviewShortcutsLegendVariant;
  className?: string;
}

export function ReviewShortcutsLegend({
  variant,
  className,
}: ReviewShortcutsLegendProps) {
  const listShortcuts: ShortcutEntry[] = [
    { keys: ["j", "k"], label: "next / prev audit" },
    { keys: ["a"], label: "approve (in review)" },
    { keys: ["r"], label: "reject (in review)" },
    { keys: ["Enter"], label: "open audit" },
    { keys: ["?"], label: "toggle this legend" },
  ];

  const entries: ShortcutEntry[] =
    variant === "list"
      ? listShortcuts
      : variant === "queue"
        ? [...QUEUE_SHORTCUTS, ...FINDING_SHORTCUTS, ...META_SHORTCUTS]
        : [
            ...FINDING_SHORTCUTS,
            ...META_SHORTCUTS.filter(
              e => e.keys[0] !== "Enter" && e.keys[0] !== "?"
            ),
          ];

  return (
    <Card className={className ?? "bg-muted/40"}>
      <CardContent className="py-2 px-3 text-xs text-muted-foreground flex flex-wrap gap-x-5 gap-y-0.5">
        {entries.map(entry => (
          <ShortcutItem key={entry.keys.join(",")} entry={entry} />
        ))}
      </CardContent>
    </Card>
  );
}
