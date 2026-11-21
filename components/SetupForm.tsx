"use client";

import { useActionState } from "react";
import { createBusiness } from "@/app/actions/auth";

export default function SetupForm() {
  const [state, action, pending] = useActionState(createBusiness, undefined);
  return (
    <form action={action} className="box">
      {state?.error && <p className="error">{state.error}</p>}
      <label>
        Business name
        <input name="businessName" required />
      </label>
      <label>
        Your name
        <input name="name" autoComplete="name" required />
      </label>
      <label>
        Email <span className="hint">(you log in with this)</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password <span className="hint">(at least 8 characters)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <button disabled={pending}>Create account</button>
    </form>
  );
}
