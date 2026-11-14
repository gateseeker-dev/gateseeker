import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "./utils";

/*
 * Dropdown (single choice), drawn by the kit rather than the system: a field-
 * looking trigger with the chosen label and a chevron, and a list of options
 * below it on the popover surface, the chosen one marked. The trigger border
 * is --border-strong so it reads on the sidebar surface, where --border is
 * darker than the surface itself. Keyboard: Enter, Space and the arrows open
 * the list; arrows move, Enter or Space choose, Escape and outside clicks
 * close. Used for "View as" in the workspace sidebar.
 */
export function Dropdown<T extends string>({ value, options, onChange, label, id, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; id?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const generated = useId();
  const triggerId = id ?? generated;
  const listId = `${triggerId}-list`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (v: T) => {
    setOpen(false);
    trigger.current?.focus();
    if (v !== value) onChange(v);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[active]; if (o) choose(o.value); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); }
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${String(active)}` : undefined}
        onClick={() => { if (open) setOpen(false); else show(); }}
        onKeyDown={onKey}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-border-strong bg-input pr-2.5 pl-3 text-left text-body text-foreground shadow-solid transition-[border-color,box-shadow] hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          open && "border-ring",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border-strong bg-popover py-1 shadow-solid">
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${String(i)}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => { setActive(i); }}
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={() => { choose(o.value); }}
                className={cn("flex h-9 cursor-pointer items-center gap-2 px-3 text-body text-foreground", i === active && "bg-accent")}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {selected && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-primary" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
