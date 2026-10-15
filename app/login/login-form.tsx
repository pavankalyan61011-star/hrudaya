"use client";

import { useFormState } from "react-dom";
import { login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
