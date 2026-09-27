"use client";

import { useState, type FormEvent } from "react";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import { COPY, isValidEmail } from "@/lib/auth/messages";
import { rememberResetEmail } from "@/lib/auth/pending-email";
import { AuthScreen, SubmitButton, TextField } from "./ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthScreen title="Reset your password" subtitle={<p role="status">{COPY.forgotSent}</p>}>
        <a
          href="/reset-password"
          className="self-center text-label font-semibold text-fg underline-offset-4 hover:underline"
        >
          Enter reset code
        </a>
      </AuthScreen>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!isValidEmail(nextEmail)) {
      setEmailError(COPY.invalidEmail);
      setFormError(COPY.fixFields);
      return;
    }
    setEmailError("");
    setFormError("");
    setPending(true);
    try {
      await withAuth((auth) => auth.resetPassword({ username: nextEmail }));
      rememberResetEmail(nextEmail);
      setSent(true);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      rememberResetEmail(nextEmail);
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      title="Reset your password"
      subtitle={
        formError ? (
          <p role="alert" className="text-sm text-[#ff6b6b]">
            {formError}
          </p>
        ) : (
          "We will email a reset code."
        )
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          id="forgot-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={emailError}
          autoComplete="email"
          placeholder="you@example.com"
        />
        <SubmitButton pending={pending}>
          {pending ? "Sending code…" : "Send reset code"}
        </SubmitButton>
      </form>
    </AuthScreen>
  );
}
