import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { AccountPanel } from "@/components/auth/AccountPanel";
import { ConfirmForm } from "@/components/auth/ConfirmForm";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { Nav } from "@/components/Nav";
import { ACCOUNT_HINT_KEY } from "@/lib/auth/account-hint";
import { COPY } from "@/lib/auth/messages";
import { SessionProvider } from "@/lib/auth/session";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

vi.mock("aws-amplify", () => ({
  Amplify: { configure: vi.fn() },
}));

vi.mock("aws-amplify/auth", () => ({
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchUserAttributes: vi.fn(),
}));

const EMAIL = "player@example.com";
const PASSWORD = "Password1";

function setEnv() {
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_example";
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID = "publicclient";
  process.env.NEXT_PUBLIC_COGNITO_REGION = "us-east-1";
}

function clearEnv() {
  delete process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  delete process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_COGNITO_REGION;
}

function storedValues(): string[] {
  return Array.from({ length: sessionStorage.length }, (_, index) => {
    const key = sessionStorage.key(index);
    return key ? (sessionStorage.getItem(key) ?? "") : "";
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  clearEnv();
  window.history.pushState({}, "", "/");
  vi.mocked(getCurrentUser).mockRejectedValue(
    Object.assign(new Error("signed out"), { name: "UserUnAuthenticatedException" }),
  );
  vi.mocked(fetchUserAttributes).mockResolvedValue({ email: EMAIL });
  vi.mocked(signOut).mockResolvedValue(undefined);
  vi.mocked(signUp).mockResolvedValue({
    isSignUpComplete: false,
    nextStep: { signUpStep: "CONFIRM_SIGN_UP" },
  } as Awaited<ReturnType<typeof signUp>>);
});

describe("sign-up", () => {
  it("calls signUp and shows a verification code, not a verification link", async () => {
    setEnv();
    render(<SignUpForm />);

    expect(
      screen.getByRole("heading", { name: "Create your Galaxy Class account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Email and password only at launch.")).toBeInTheDocument();
    expect(screen.getByText(COPY.passwordRule)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");

    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText(`We sent a verification code to ${EMAIL}.`)).toBeInTheDocument();
    expect(screen.queryByText(/verification link/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter verification code" })).toHaveAttribute(
      "href",
      "/confirm",
    );
    expect(signUp).toHaveBeenCalledWith({
      username: EMAIL,
      password: PASSWORD,
      options: { userAttributes: { email: EMAIL } },
    });
    expect(storedValues().join(" ")).not.toContain(PASSWORD);
    expect(window.location.href).not.toContain(PASSWORD);

    const payload = JSON.stringify(vi.mocked(Amplify.configure).mock.calls.at(-1)?.[0]);
    expect(payload).toContain("us-east-1_example");
    expect(payload).toContain("publicclient");
    expect(payload).not.toMatch(/oauth|hosted|secret/i);
  });

  it("shows the submitting label while sign-up is in flight", async () => {
    setEnv();
    let resolveSignUp: (value: Awaited<ReturnType<typeof signUp>>) => void = () => {};
    vi.mocked(signUp).mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      }),
    );
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("button", { name: COPY.creating }),
    ).toBeInTheDocument();
    resolveSignUp({
      isSignUpComplete: false,
      nextStep: { signUpStep: "CONFIRM_SIGN_UP" },
    } as Awaited<ReturnType<typeof signUp>>);
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
  });

  it("highlights invalid fields without calling Amplify", async () => {
    setEnv();
    render(<SignUpForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.fixFields);
    expect(screen.getByText(COPY.invalidEmail)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-describedby",
      "sign-up-email-error",
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("does not say a duplicate email is already registered", async () => {
    setEnv();
    vi.mocked(signUp).mockRejectedValue(
      Object.assign(new Error("An account with the given email already exists."), {
        name: "UsernameExistsException",
      }),
    );
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(`We sent a verification code to ${EMAIL}.`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it("does not call Amplify when Cognito env is missing", async () => {
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.configError);
    expect(signUp).not.toHaveBeenCalled();
    expect(Amplify.configure).not.toHaveBeenCalled();
  });
});

describe("confirm", () => {
  it("calls confirmSignUp with the email remembered from sign-up", async () => {
    setEnv();
    sessionStorage.setItem("galaxyclass.confirm.email", EMAIL);
    vi.mocked(confirmSignUp).mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: "DONE" },
    });
    render(<ConfirmForm />);

    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    fill("Verification code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(confirmSignUp).toHaveBeenCalledWith({
        username: EMAIL,
        confirmationCode: "123456",
      });
    });
    expect(nav.push).toHaveBeenCalledWith("/sign-in");
  });

  it("asks for email when sign-up did not store one", async () => {
    render(<ConfirmForm />);
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  });

  it("resends the code without enumeration copy", async () => {
    setEnv();
    sessionStorage.setItem("galaxyclass.confirm.email", EMAIL);
    vi.mocked(resendSignUpCode).mockResolvedValue({
      destination: "e***@example.com",
      deliveryMedium: "EMAIL",
      attributeName: "email",
    });
    render(<ConfirmForm />);
    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() => {
      expect(resendSignUpCode).toHaveBeenCalledWith({ username: EMAIL });
    });
    expect(screen.queryByText(/not found|already registered/i)).not.toBeInTheDocument();
  });

  it("shows an invalid or expired code error", async () => {
    setEnv();
    sessionStorage.setItem("galaxyclass.confirm.email", EMAIL);
    vi.mocked(confirmSignUp).mockRejectedValue(
      Object.assign(new Error("Invalid code"), { name: "CodeMismatchException" }),
    );
    render(<ConfirmForm />);
    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });
    fill("Verification code", "000000");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.confirmError);
  });
});

describe("sign-in", () => {
  async function submitSignIn() {
    cleanup();
    render(<SignInForm />);
    const main = within(screen.getByRole("main"));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(main.getByText("Welcome back to Galaxy Class.")).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Forgot password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(main.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("follows a safe next path and otherwise goes to /account", async () => {
    setEnv();
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });

    window.history.pushState({}, "", "/sign-in?next=/riffle");
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/riffle");
    });

    nav.push.mockClear();
    window.history.pushState({}, "", "/sign-in?next=//evil.example");
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/account");
    });

    nav.push.mockClear();
    window.history.pushState({}, "", "/sign-in?next=https://evil.example");
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/account");
    });
  });

  it("shows the submitting label while sign-in is in flight", async () => {
    setEnv();
    let resolveSignIn: (value: Awaited<ReturnType<typeof signIn>>) => void = () => {};
    vi.mocked(signIn).mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    render(<SignInForm />);
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("button", { name: COPY.signingIn })).toBeInTheDocument();
    resolveSignIn({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/account");
    });
  });

  it("uses one message for an unknown user and a wrong password", async () => {
    setEnv();
    vi.mocked(signIn).mockRejectedValueOnce(
      Object.assign(new Error("User does not exist."), { name: "UserNotFoundException" }),
    );
    await submitSignIn();
    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.signInFailed);

    vi.mocked(signIn).mockRejectedValueOnce(
      Object.assign(new Error("Incorrect username or password."), {
        name: "NotAuthorizedException",
      }),
    );
    await submitSignIn();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.every((alert) => alert.textContent === COPY.signInFailed)).toBe(true);
    expect(screen.queryByText(/does not exist|username/i)).not.toBeInTheDocument();
  });

  it("tells an unconfirmed user to confirm before signing in", async () => {
    setEnv();
    vi.mocked(signIn).mockRejectedValueOnce(
      Object.assign(new Error("User is not confirmed."), { name: "UserNotConfirmedException" }),
    );
    await submitSignIn();
    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.unconfirmed);

    vi.mocked(signIn).mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_UP" },
    });
    await submitSignIn();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent === COPY.unconfirmed)).toBe(true);
  });
});

describe("account", () => {
  it("redirects signed-out visitors to sign-in and hides email while unresolved", async () => {
    setEnv();
    let rejectUser: (reason?: unknown) => void = () => {};
    vi.mocked(getCurrentUser).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUser = reject;
        }) as ReturnType<typeof getCurrentUser>,
    );
    render(
      <SessionProvider>
        <AccountPanel />
      </SessionProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking your session.");
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getCurrentUser).toHaveBeenCalled();
    });

    await act(async () => {
      rejectUser(new Error("signed out"));
    });
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/sign-in?next=/account");
    });
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
  });

  it("shows the signed-in account and nav", async () => {
    setEnv();
    vi.mocked(getCurrentUser).mockResolvedValue({
      username: EMAIL,
      userId: "user-1",
    });
    render(
      <SessionProvider>
        <AccountPanel />
      </SessionProvider>,
    );

    expect(await screen.findByText(EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your Galaxy Class account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Galaxy Class identity across games")).toBeInTheDocument();
    const navBar = screen.getByRole("navigation", { name: "Main" });
    expect(navBar).toHaveTextContent("Account");
    expect(navBar).toHaveTextContent("Sign out");
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });
});

describe("forgot and reset password", () => {
  it("always shows the generic check-email line", async () => {
    setEnv();
    vi.mocked(resetPassword).mockResolvedValueOnce({
      isPasswordReset: false,
      nextStep: {
        resetPasswordStep: "CONFIRM_RESET_PASSWORD_WITH_CODE",
        codeDeliveryDetails: { deliveryMedium: "EMAIL", destination: "p***@example.com" },
      },
    });
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    fill("Email", EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    expect(await screen.findByRole("status")).toHaveTextContent(COPY.forgotSent);
    expect(screen.getByRole("link", { name: "Enter reset code" })).toHaveAttribute(
      "href",
      "/reset-password",
    );

    vi.mocked(resetPassword).mockRejectedValueOnce(
      Object.assign(new Error("User does not exist."), { name: "UserNotFoundException" }),
    );
    cleanup();
    render(<ForgotPasswordForm />);
    fill("Email", "missing@example.com");
    fireEvent.click(screen.getAllByRole("button", { name: "Send reset code" })[0]);
    const statuses = await screen.findAllByRole("status");
    expect(statuses.every((status) => status.textContent === COPY.forgotSent)).toBe(true);
    expect(screen.queryByText(/does not exist|not found/i)).not.toBeInTheDocument();
  });

  it("confirms the reset without putting the password in the URL", async () => {
    setEnv();
    sessionStorage.setItem("galaxyclass.reset.email", EMAIL);
    vi.mocked(confirmResetPassword).mockResolvedValue(undefined);
    render(<ResetPasswordForm />);
    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
    fill("Reset code", "654321");
    fill("New password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(confirmResetPassword).toHaveBeenCalledWith({
        username: EMAIL,
        confirmationCode: "654321",
        newPassword: PASSWORD,
      });
    });
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument();
    expect(screen.getByText(COPY.resetSuccessBody)).toBeInTheDocument();
    expect(window.location.href).not.toContain(PASSWORD);
    expect(storedValues().join(" ")).not.toContain(PASSWORD);
  });

  it("asks for email when forgot-password did not store one", async () => {
    render(<ResetPasswordForm />);
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  });

  it("shows a validation error for a weak new password", async () => {
    setEnv();
    sessionStorage.setItem("galaxyclass.reset.email", EMAIL);
    render(<ResetPasswordForm />);
    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });
    fill("Reset code", "654321");
    fill("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.fixFields);
    expect(confirmResetPassword).not.toHaveBeenCalled();
  });
});

describe("nav session", () => {
  it("returns to Sign in and Sign up after sign-out", async () => {
    setEnv();
    vi.mocked(getCurrentUser).mockResolvedValue({
      username: EMAIL,
      userId: "user-1",
    });
    render(
      <SessionProvider>
        <Nav />
      </SessionProvider>,
    );

    expect(await screen.findByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(JSON.parse(localStorage.getItem(ACCOUNT_HINT_KEY) ?? "null")).toEqual({ email: EMAIL });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(localStorage.getItem(ACCOUNT_HINT_KEY)).toBeNull();
    });
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });
});
