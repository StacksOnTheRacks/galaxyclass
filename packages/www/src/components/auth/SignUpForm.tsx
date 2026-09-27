"use client";

import { useState, type FormEvent } from "react";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import {
  COPY,
  isDuplicateSignUp,
  isValidEmail,
  isValidPassword,
  verificationCodeSent,
} from "@/lib/auth/messages";
import { rememberConfirmEmail } from "@/lib/auth/pending-email";
import { AuthScreen, SubmitButton, TextField } from "./ui";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthScreen
        title={COPY.checkEmailTitle}
        subtitle={
          <p role="status">{verificationCodeSent(email.trim())}</p>
        }
      >
        <a
          href="/confirm"
          className="self-center text-label font-semibold text-fg underline-offset-4 hover:underline"
        >
          Enter verification code
        </a>
      </AuthScreen>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    const nextEmailError = isValidEmail(nextEmail) ? "" : COPY.invalidEmail;
    const nextPasswordError = isValidPassword(password) ? "" : COPY.passwordRule;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError("");

    if (nextEmailError || nextPasswordError) {
      setFormError(COPY.fixFields);
      return;
    }

    setPending(true);
    try {
      await withAuth((auth) =>
        auth.signUp({
          username: nextEmail,
          password,
          options: { userAttributes: { email: nextEmail } },
        }),
      );
      rememberConfirmEmail(nextEmail);
      setSent(true);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      if (isDuplicateSignUp(error)) {
        rememberConfirmEmail(nextEmail);
        setSent(true);
        return;
      }
      setFormError(COPY.signUpFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      title="Create your Galaxy Class account"
      subtitle={
        formError ? (
          <p role="alert" className="text-sm text-[#ff6b6b]">
            {formError}
          </p>
        ) : (
          "Email and password only at launch."
        )
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          id="sign-up-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={emailError}
          autoComplete="email"
          placeholder="you@example.com"
        />
        <TextField
          id="sign-up-password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          describedBy={passwordError ? undefined : "sign-up-password-rule"}
          autoComplete="new-password"
        />
        {passwordError ? null : (
          <p id="sign-up-password-rule" className="text-left text-body-m text-fg-muted">
            {COPY.passwordRule}
          </p>
        )}
        <SubmitButton pending={pending}>
          {pending ? COPY.creating : "Create account"}
        </SubmitButton>
      </form>
    </AuthScreen>
  );
}
