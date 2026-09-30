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
import { ButtonLink, TextLink } from "@/components/primitives";
import { AuthScreen, FieldHint, FormAlert, SubmitButton, TextField } from "./ui";

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
        kind="sign-up"
        success="Code sent"
        title={COPY.checkEmailTitle}
        subtitle={
          <p role="status">{verificationCodeSent(email.trim())}</p>
        }
      >
        <ButtonLink href="/confirm" size="lg" arrow className="w-full">
          Enter verification code
        </ButtonLink>
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
      kind="sign-up"
      title="Create your Galaxy Class account"
      subtitle={
        formError ? (
          <FormAlert>{formError}</FormAlert>
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
          <FieldHint id="sign-up-password-rule">{COPY.passwordRule}</FieldHint>
        )}
        <SubmitButton pending={pending}>
          {pending ? COPY.creating : "Create account"}
        </SubmitButton>
      </form>
      <p className="border-t border-bezel pt-5 text-ink-muted">
        Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
      </p>
    </AuthScreen>
  );
}
