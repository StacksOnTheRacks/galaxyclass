"use client";

import { useState, type FormEvent } from "react";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import { COPY, isValidEmail } from "@/lib/auth/messages";
import { rememberResetEmail } from "@/lib/auth/pending-email";
import { ButtonLink, TextLink } from "@/components/primitives";
import { AuthScreen, FormAlert, SubmitButton, TextField } from "./ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthScreen
        kind="forgot"
        success="Request received"
        title="Reset your password"
        subtitle={<p role="status">{COPY.forgotSent}</p>}
      >
        <ButtonLink href="/reset-password" size="lg" arrow className="w-full">
          Enter reset code
        </ButtonLink>
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
      kind="forgot"
      title="Reset your password"
      subtitle={
        formError ? <FormAlert>{formError}</FormAlert> : "We will email a reset code."
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
      <p className="border-t border-bezel pt-5 text-ink-muted">
        Remembered it? <TextLink href="/sign-in">Back to sign in</TextLink>
      </p>
    </AuthScreen>
  );
}
