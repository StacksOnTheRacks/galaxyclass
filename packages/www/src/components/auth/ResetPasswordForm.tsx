"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import { COPY, isValidEmail, isValidPassword } from "@/lib/auth/messages";
import { readResetEmail } from "@/lib/auth/pending-email";
import { ButtonLink } from "@/components/primitives";
import { AuthScreen, FieldHint, FormAlert, SubmitButton, TextField } from "./ui";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [remembered, setRemembered] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const stored = readResetEmail();
    if (stored) {
      setEmail(stored);
      setRemembered(true);
    }
  }, []);

  if (done) {
    return (
      <AuthScreen
        kind="reset"
        success="Password saved"
        title={COPY.resetSuccessTitle}
        subtitle={<p role="status">{COPY.resetSuccessBody}</p>}
      >
        <ButtonLink href="/sign-in" size="lg" arrow className="w-full">
          Sign in
        </ButtonLink>
      </AuthScreen>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    const nextEmailError = isValidEmail(nextEmail) ? "" : COPY.invalidEmail;
    const nextCodeError = code.trim() ? "" : COPY.codeRequired;
    const nextPasswordError = isValidPassword(password) ? "" : COPY.passwordRule;
    setEmailError(nextEmailError);
    setCodeError(nextCodeError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextCodeError || nextPasswordError) {
      setFormError(COPY.fixFields);
      return;
    }
    setFormError("");
    setPending(true);
    try {
      await withAuth((auth) =>
        auth.confirmResetPassword({
          username: nextEmail,
          confirmationCode: code.trim(),
          newPassword: password,
        }),
      );
      setDone(true);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      setFormError(COPY.resetFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      kind="reset"
      title="Choose a new password"
      subtitle={formError ? <FormAlert>{formError}</FormAlert> : undefined}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {remembered ? null : (
          <TextField
            id="reset-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            error={emailError}
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}
        <TextField
          id="reset-code"
          label="Reset code"
          type="text"
          value={code}
          onChange={setCode}
          error={codeError}
          autoComplete="one-time-code"
        />
        <TextField
          id="reset-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          describedBy={passwordError ? undefined : "reset-password-rule"}
          autoComplete="new-password"
        />
        {passwordError ? null : (
          <FieldHint id="reset-password-rule">{COPY.passwordRule}</FieldHint>
        )}
        <SubmitButton pending={pending}>
          {pending ? "Updating password…" : "Update password"}
        </SubmitButton>
      </form>
    </AuthScreen>
  );
}
