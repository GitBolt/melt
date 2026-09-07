import { useEffect, useRef } from "react";
export function useDialogFocus(
  kind: string | undefined,
  busy: boolean,
  close: () => void,
) {
  const current = useRef({ busy, close });
  current.current = { busy, close };
  useEffect(() => {
    if (!kind) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !current.current.busy)
        current.current.close();
      if (event.key !== "Tab") return;
      const nodes = dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),a[href],input:not(:disabled)",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handle);
      if (previous?.isConnected) previous.focus();
    };
  }, [kind]);
}
