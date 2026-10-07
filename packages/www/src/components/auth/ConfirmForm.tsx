"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthConfigError, withAuth } from "@/lib/auth/api";
import { COPY, isValidEmail } from "@/lib/auth/messages";
import { readConfirmEmail } from "@/lib/auth/pending-email";
import { readNextParam, withNext } from "@/lib/auth/safe-next";
import {
  AuthScreen,
  FormAlert,
  FormNotice,
  SubmitButton,
  TextAction,
  TextField,
} from "./ui";

export function ConfirmForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [remembered, setRemembered] = useState(false);
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const stored = readConfirmEmail();
    if (stored) {
      setEmail(stored);
      setRemembered(true);
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    const nextEmailError = isValidEmail(nextEmail) ? "" : COPY.invalidEmail;
    const nextCodeError = code.trim() ? "" : COPY.codeRequired;
    setEmailError(nextEmailError);
    setCodeError(nextCodeError);
    setFormError("");
    setNotice("");
    if (nextEmailError || nextCodeError) return;

    setPending(true);
    try {
      await withAuth((auth) =>
        auth.confirmSignUp({
          username: nextEmail,
          confirmationCode: code.trim(),
        }),
      );
      router.push(withNext("/sign-in", readNextParam()));
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      setFormError(COPY.confirmError);
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    const nextEmail = email.trim();
    setNotice("");
    setFormError("");
    if (!isValidEmail(nextEmail)) {
      setEmailError(COPY.invalidEmail);
      return;
    }
    setEmailError("");
    setPending(true);
    try {
      await withAuth((auth) => auth.resendSignUpCode({ username: nextEmail }));
      setNotice(COPY.resendSent);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        setFormError(COPY.configError);
        return;
      }
      setNotice(COPY.resendFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      kind="confirm"
      title="Confirm your email"
      subtitle={
        formError ? (
          <FormAlert>{formError}</FormAlert>
        ) : (
          "Enter the verification code we sent."
        )
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {remembered ? null : (
          <TextField
            id="confirm-email"
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
          id="confirm-code"
          label="Verification code"
          type="text"
          value={code}
          onChange={setCode}
          error={codeError}
          autoComplete="one-time-code"
        />
        <SubmitButton pending={pending}>Confirm</SubmitButton>
      </form>
      <div className="flex flex-col gap-3 border-t border-bezel pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-ink-muted">No code yet?</p>
          <TextAction onClick={() => void onResend()} pending={pending}>
            Resend code
          </TextAction>
        </div>
        {notice ? <FormNotice>{notice}</FormNotice> : null}
      </div>
    </AuthScreen>
  );
}
