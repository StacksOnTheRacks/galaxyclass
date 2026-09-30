"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import {
  COPY,
  cognitoName,
  isValidEmail,
  isValidPassword,
} from "@/lib/auth/messages";
import { readNextFromLocation } from "@/lib/auth/safe-next";
import { useSession } from "@/lib/auth/session";
import { TextLink } from "@/components/primitives";
import { AuthScreen, FormAlert, SubmitButton, TextField } from "./ui";

export function SignInForm() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

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
      const result = await withAuth((auth) =>
        auth.signIn({ username: nextEmail, password }),
      );
      if (result.isSignedIn) {
        await session.refresh();
        router.push(readNextFromLocation());
        return;
      }
      if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
        setFormError(COPY.unconfirmed);
        return;
      }
      setFormError(COPY.signInGeneric);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      if (cognitoName(error) === "UserNotConfirmedException") {
        setFormError(COPY.unconfirmed);
        return;
      }
      if (
        cognitoName(error) === "UserNotFoundException" ||
        cognitoName(error) === "NotAuthorizedException"
      ) {
        setFormError(COPY.signInFailed);
        return;
      }
      setFormError(COPY.signInGeneric);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      kind="sign-in"
      title="Sign in"
      subtitle={
        formError ? <FormAlert>{formError}</FormAlert> : "Welcome back to Galaxy Class."
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          id="sign-in-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={emailError}
          autoComplete="email"
          placeholder="you@example.com"
        />
        <TextField
          id="sign-in-password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          autoComplete="current-password"
        />
        <SubmitButton pending={pending}>
          {pending ? COPY.signingIn : "Sign in"}
        </SubmitButton>
      </form>
      <div className="flex flex-col gap-3 border-t border-bezel pt-5 sm:flex-row sm:items-center sm:justify-between">
        <TextLink href="/forgot-password">Forgot password</TextLink>
        <p className="text-ink-muted">
          New here? <TextLink href="/sign-up">Sign up</TextLink>
        </p>
      </div>
    </AuthScreen>
  );
}
