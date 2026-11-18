"use client";

import { useActionState } from "react";
import { ownerLogin, pinLogin } from "@/app/actions/auth";

export default function LoginForms() {
  const [pinState, pinAction, pinPending] = useActionState(pinLogin, undefined);
  const [ownerState, ownerAction, ownerPending] = useActionState(ownerLogin, undefined);

  return (
    <>
      <form action={pinAction} className="box">
        <h2 style={{ marginTop: 0 }}>Crew and clients</h2>
        {pinState?.error && <p className="error">{pinState.error}</p>}
        <label>
          ID number
          <input name="loginId" inputMode="numeric" autoComplete="username" maxLength={7} required />
        </label>
        <label>
          PIN
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            required
          />
        </label>
        <button className="big" disabled={pinPending}>Log in</button>
      </form>

      <details className="box">
        <summary>Owner login</summary>
        <form action={ownerAction} style={{ marginTop: 12 }}>
          {ownerState?.error && <p className="error">{ownerState.error}</p>}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button disabled={ownerPending}>Log in</button>
        </form>
      </details>
    </>
  );
}
