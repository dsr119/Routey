"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

export type ActionResult = { error?: string; message?: string } | undefined;

// A form wired to a server action that can return an error or a message.
// Clears its inputs after a successful save unless keep is set.
export default function ActionForm({
  action,
  submit,
  children,
  className = "box",
  keep = false,
  secondary = false,
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  submit: string;
  children: React.ReactNode;
  className?: string;
  keep?: boolean;
  secondary?: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && !state.error && !keep) ref.current?.reset();
  }, [state, keep]);

  return (
    <form
      className={className}
      ref={ref}
      // Submitting by hand keeps typed values when the save fails.
      // (A plain action prop makes React clear the form every time.)
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {state?.error && <p className="error">{state.error}</p>}
      {state?.message && <p className="notice">{state.message}</p>}
      {children}
      <button disabled={pending} className={secondary ? "secondary" : undefined}>
        {submit}
      </button>
    </form>
  );
}
