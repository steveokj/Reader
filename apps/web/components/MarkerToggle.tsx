"use client";

type MarkerKind = "like" | "highlight" | "todo";

type MarkerToggleProps = {
  activeKinds: MarkerKind[];
  onToggle: (kind: MarkerKind) => void;
  compact?: boolean;
  className?: string;
};

function IconLike() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-6-4.4-8.5-7.3C1.2 11.2 2 7.8 4.9 6.7 6.7 6 9 6.6 10.2 8.3L12 10.4l1.8-2.1C15 6.6 17.3 6 19.1 6.7c2.9 1.1 3.7 4.5 1.4 7-2.5 2.9-8.5 7.3-8.5 7.3z" />
    </svg>
  );
}

function IconHighlight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 15l7-7 3 3-7 7H7v-3z" />
    </svg>
  );
}

function IconTodo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function MarkerButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "marker-button is-active" : "marker-button"}
      onClick={onClick}
      aria-label={title}
      title={title}
    >
      {children}
    </button>
  );
}

export default function MarkerToggle({
  activeKinds,
  onToggle,
  compact,
  className,
}: MarkerToggleProps) {
  const classes = ["marker-toggle", compact ? "marker-toggle--compact" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <MarkerButton active={activeKinds.includes("like")} onClick={() => onToggle("like")} title="Like">
        <IconLike />
      </MarkerButton>
      <MarkerButton
        active={activeKinds.includes("highlight")}
        onClick={() => onToggle("highlight")}
        title="Highlight"
      >
        <IconHighlight />
      </MarkerButton>
      <MarkerButton active={activeKinds.includes("todo")} onClick={() => onToggle("todo")} title="Todo">
        <IconTodo />
      </MarkerButton>
    </div>
  );
}
