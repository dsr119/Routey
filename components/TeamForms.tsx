"use client";

import { useActionState } from "react";
import { addEmployee, resetPin, type NewLogin } from "@/app/actions/team";

function ShowLogin({ state }: { state: NewLogin }) {
  if (!state) return null;
  if ("error" in state) return <p className="error">{state.error}</p>;
  return (
    <p className="notice">
      Login for <strong>{state.name}</strong>: ID <strong>{state.loginId}</strong>, PIN{" "}
      <strong>{state.pin}</strong>. Write the PIN down now. It won&apos;t be shown again.
    </p>
  );
}

export function AddEmployeeForm() {
  const [state, action, pending] = useActionState(addEmployee, undefined);
  return (
    <form action={action} className="box">
      <ShowLogin state={state} />
      <div className="row">
        <label style={{ flex: "2 1 200px" }}>
          Name
          <input name="name" required />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          Phone <span className="hint">(optional)</span>
          <input name="phone" type="tel" />
        </label>
      </div>
      <button disabled={pending}>Add employee</button>
    </form>
  );
}

export function ResetPinButton({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(resetPin, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <ShowLogin state={state} />
      <button className="link" disabled={pending}>New PIN</button>
    </form>
  );
}
