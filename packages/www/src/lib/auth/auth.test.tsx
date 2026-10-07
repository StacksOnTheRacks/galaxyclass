import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
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
import { PROFILE_COPY } from "@/lib/profile/messages";
import { GAMER_TAG_MESSAGES, GAMER_TAG_RULE } from "@galaxyclass/accounts/gamer-tag";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

const hard = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@/lib/auth/navigate", () => ({ hardNavigate: hard.navigate }));

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
  fetchAuthSession: vi.fn(),
}));

const EMAIL = "player@example.com";
const PASSWORD = "Password1";
const GAMER_TAG = "River_Rat";

type ApiCall = { method: string; path: string; body: unknown; authorization: string | null };

/** In-memory stand-in for the same-origin profile API behind CloudFront /api/*. */
const api = {
  profile: { gamerTag: null as string | null, avatarId: 7 },
  taken: new Set<string>(),
  fail: false,
  calls: [] as ApiCall[],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const path = String(input);
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  api.calls.push({
    method,
    path,
    body,
    authorization: new Headers(init.headers).get("authorization"),
  });
  if (api.fail) return json(500, { error: "server_error" });

  if (method === "GET" && path.startsWith("/api/gamer-tags/")) {
    const tag = decodeURIComponent(path.slice("/api/gamer-tags/".length));
    const available = !api.taken.has(tag.toLowerCase());
    return json(200, available ? { gamerTag: tag, available } : { gamerTag: tag, available, reason: "taken" });
  }
  if (method === "GET" && path === "/api/profile") return json(200, api.profile);
  if (method === "PUT" && path === "/api/profile/gamer-tag") {
    const tag = (body as { gamerTag: string }).gamerTag;
    if (api.taken.has(tag.toLowerCase())) return json(409, { error: "gamer_tag_taken" });
    api.profile = { ...api.profile, gamerTag: tag };
    return json(200, api.profile);
  }
  if (method === "PUT" && path === "/api/profile/avatar") {
    api.profile = { ...api.profile, avatarId: (body as { avatarId: number }).avatarId };
    return json(200, api.profile);
  }
  return json(400, { error: "bad_request" });
}

function signedIn() {
  setEnv();
  vi.mocked(getCurrentUser).mockResolvedValue({ username: EMAIL, userId: "user-1" });
}

function renderAccount() {
  return render(
    <SessionProvider>
      <AccountPanel />
    </SessionProvider>,
  );
}

function storedHint(): unknown {
  return JSON.parse(localStorage.getItem(ACCOUNT_HINT_KEY) ?? "null");
}

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
  vi.mocked(fetchAuthSession).mockResolvedValue({
    tokens: { idToken: { toString: () => "id-token" } },
  } as Awaited<ReturnType<typeof fetchAuthSession>>);
  api.profile = { gamerTag: null, avatarId: 7 };
  api.taken = new Set(["taken_tag"]);
  api.fail = false;
  api.calls = [];
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.mocked(signOut).mockResolvedValue(undefined);
  vi.mocked(signUp).mockResolvedValue({
    isSignUpComplete: false,
    nextStep: { signUpStep: "CONFIRM_SIGN_UP" },
  } as Awaited<ReturnType<typeof signUp>>);
});

describe("auth screens", () => {
  it.each([
    ["sign-in", () => <SignInForm />],
    ["sign-up", () => <SignUpForm />],
    ["forgot password", () => <ForgotPasswordForm />],
  ])("%s sends players to the rooms instead of straight to Riffle Poker", (_, form) => {
    const { container } = render(form());

    expect(container.querySelector('a[href^="/riffle"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Browse rooms" })).toHaveAttribute("href", "/");
  });

  it("names the game Riffle Poker in sign-up copy", () => {
    render(<SignUpForm />);

    expect(
      screen.getByText("Works across every Galaxy Class game, starting with Riffle Poker."),
    ).toBeInTheDocument();
  });
});

describe("sign-up", () => {
  it("calls signUp and shows a verification code, not a verification link", async () => {
    setEnv();
    render(<SignUpForm />);

    expect(
      screen.getByRole("heading", { name: "Create your Galaxy Class account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Email, gamer tag, and password. That’s it.")).toBeInTheDocument();
    expect(screen.getByText(COPY.passwordRule)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Gamer tag")).toHaveAccessibleDescription(
      new RegExp(GAMER_TAG_RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );

    fill("Email", EMAIL);
    fill("Gamer tag", ` ${GAMER_TAG} `);
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
    expect(sessionStorage.getItem("galaxyclass.confirm.email")).toBe(EMAIL);
    expect(nav.push).toHaveBeenCalledWith("/confirm");
    expect(signUp).toHaveBeenCalledWith({
      username: EMAIL,
      password: PASSWORD,
      options: {
        userAttributes: { email: EMAIL },
        clientMetadata: { gamerTag: GAMER_TAG },
      },
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
    fill("Gamer tag", GAMER_TAG);
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
    expect(screen.getByText(GAMER_TAG_MESSAGES.required)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("rejects a badly formatted gamer tag before calling Amplify", async () => {
    setEnv();
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Gamer tag", "no spaces");
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(GAMER_TAG_MESSAGES.invalid_characters)).toBeInTheDocument();
    expect(screen.getByLabelText("Gamer tag")).toHaveAttribute("aria-invalid", "true");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("checks availability on blur without sending credentials", async () => {
    setEnv();
    render(<SignUpForm />);
    fill("Gamer tag", GAMER_TAG);
    fireEvent.blur(screen.getByLabelText("Gamer tag"));
    expect(await screen.findByText(`${GAMER_TAG} is available.`)).toBeInTheDocument();

    fill("Gamer tag", "Taken_Tag");
    fireEvent.blur(screen.getByLabelText("Gamer tag"));
    expect(await screen.findByText(GAMER_TAG_MESSAGES.taken)).toBeInTheDocument();
    expect(api.calls.map((call) => [call.path, call.authorization])).toEqual([
      [`/api/gamer-tags/${GAMER_TAG}`, null],
      ["/api/gamer-tags/Taken_Tag", null],
    ]);
  });

  it("shows the taken message when the sign-up trigger rejects the gamer tag", async () => {
    setEnv();
    vi.mocked(signUp).mockRejectedValue(
      Object.assign(new Error("PreSignUp failed with error GAMER_TAG_TAKEN."), {
        name: "UserLambdaValidationException",
      }),
    );
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Gamer tag", GAMER_TAG);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(GAMER_TAG_MESSAGES.taken)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(COPY.fixFields);
    expect(screen.queryByRole("heading", { name: "Check your email" })).not.toBeInTheDocument();
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
    fill("Gamer tag", GAMER_TAG);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(`We sent a verification code to ${EMAIL}.`),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("galaxyclass.confirm.email")).toBe(EMAIL);
    expect(nav.push).toHaveBeenCalledWith("/confirm");
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it("does not call Amplify when Cognito env is missing", async () => {
    render(<SignUpForm />);
    fill("Email", EMAIL);
    fill("Gamer tag", GAMER_TAG);
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

  it("carries a game's next path from sign-up through confirm to sign-in", async () => {
    setEnv();
    window.history.pushState({}, "", "/sign-up?next=/scribble");
    render(<SignUpForm />);
    expect(within(screen.getByRole("main")).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fscribble",
    );
    fill("Email", EMAIL);
    fill("Gamer tag", GAMER_TAG);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/confirm?next=%2Fscribble");
    });
    cleanup();

    window.history.pushState({}, "", "/confirm?next=/scribble");
    sessionStorage.setItem("galaxyclass.confirm.email", EMAIL);
    vi.mocked(confirmSignUp).mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: "DONE" },
    });
    render(<ConfirmForm />);
    fill("Verification code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/sign-in?next=%2Fscribble");
    });
    window.history.pushState({}, "", "/");
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
    fill("Email", EMAIL);
    fill("Password", PASSWORD);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("links to sign-up, carrying the next path when there is one", () => {
    window.history.pushState({}, "", "/sign-in");
    render(<SignInForm />);
    const signUp = () => within(screen.getByRole("main")).getByRole("link", { name: "Sign up" });
    expect(signUp()).toHaveAttribute("href", "/sign-up");
    cleanup();
    window.history.pushState({}, "", "/sign-in?next=/scribble/abc");
    render(<SignInForm />);
    expect(signUp()).toHaveAttribute(
      "href",
      "/sign-up?next=%2Fscribble%2Fabc",
    );
  });

  it("loads a game page in full after signing in, since games live outside the Next app", async () => {
    setEnv();
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });
    hard.navigate.mockClear();
    window.history.pushState({}, "", "/sign-in?next=/scribble/abc");
    await submitSignIn();
    await waitFor(() => {
      expect(hard.navigate).toHaveBeenCalledWith("/scribble/abc");
    });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("follows a safe next path and otherwise goes to /account", async () => {
    setEnv();
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });

    nav.push.mockClear();
    window.history.pushState({}, "", "/sign-in?next=/about");
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/about");
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

  it("sends an unconfirmed user to the verification code page", async () => {
    setEnv();
    vi.mocked(signIn).mockRejectedValueOnce(
      Object.assign(new Error("User is not confirmed."), { name: "UserNotConfirmedException" }),
    );
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/confirm");
    });
    expect(sessionStorage.getItem("galaxyclass.confirm.email")).toBe(EMAIL);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    nav.push.mockClear();
    vi.mocked(signIn).mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_UP" },
    });
    await submitSignIn();
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/confirm");
    });
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
    signedIn();
    api.profile = { gamerTag: GAMER_TAG, avatarId: 12 };
    renderAccount();

    expect(await screen.findByText(EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your Galaxy Class account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Galaxy Class identity across games")).toBeInTheDocument();
    expect(await screen.findByLabelText("Gamer tag")).toHaveValue(GAMER_TAG);
    expect(screen.queryByText(PROFILE_COPY.missingTagTitle)).not.toBeInTheDocument();
    const navBar = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(navBar).getByRole("link", { name: `Signed in as ${GAMER_TAG}` }),
    ).toHaveAttribute("href", "/account");
    expect(navBar).toHaveTextContent("Sign out");
    expect(navBar).not.toHaveTextContent(EMAIL);
    const tabs = within(screen.getByRole("navigation", { name: "App" }));
    expect(tabs.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
    expect(api.calls[0]).toMatchObject({
      method: "GET",
      path: "/api/profile",
      authorization: "Bearer id-token",
    });
  });

  it("does not link to Riffle Poker from the account page", async () => {
    signedIn();
    api.profile = { gamerTag: GAMER_TAG, avatarId: 12 };
    const { container } = renderAccount();

    expect(await screen.findByLabelText("Gamer tag")).toHaveValue(GAMER_TAG);
    expect(container.querySelector('a[href^="/riffle"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /riffle/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse rooms" })).toHaveAttribute("href", "/");
  });

  it("prompts an existing player without a gamer tag and saves one", async () => {
    signedIn();
    renderAccount();

    expect(await screen.findByText(PROFILE_COPY.missingTagTitle)).toBeInTheDocument();
    expect(screen.getByText("Not set yet")).toBeInTheDocument();
    fill("Gamer tag", GAMER_TAG);
    fireEvent.click(screen.getByRole("button", { name: "Set gamer tag" }));

    expect(await screen.findByText(PROFILE_COPY.tagSaved)).toBeInTheDocument();
    expect(api.calls.at(-1)).toMatchObject({
      method: "PUT",
      path: "/api/profile/gamer-tag",
      body: { gamerTag: GAMER_TAG },
    });
    expect(screen.queryByText(PROFILE_COPY.missingTagTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save gamer tag" })).toBeInTheDocument();
    expect(storedHint()).toEqual({ signedIn: true, gamerTag: GAMER_TAG, avatarId: 7 });
  });

  it("validates a changed gamer tag and reports one that is taken", async () => {
    signedIn();
    api.profile = { gamerTag: GAMER_TAG, avatarId: 7 };
    renderAccount();
    await screen.findByRole("button", { name: "Save gamer tag" });

    fill("Gamer tag", "a");
    fireEvent.click(screen.getByRole("button", { name: "Save gamer tag" }));
    expect(await screen.findByText(GAMER_TAG_MESSAGES.too_short)).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);

    fill("Gamer tag", "Taken_Tag");
    fireEvent.click(screen.getByRole("button", { name: "Save gamer tag" }));
    expect(await screen.findByText(GAMER_TAG_MESSAGES.taken)).toBeInTheDocument();
    expect(screen.getByLabelText("Gamer tag")).toHaveAttribute("aria-invalid", "true");
    expect(api.profile.gamerTag).toBe(GAMER_TAG);
    expect(storedHint()).toEqual({ signedIn: true, gamerTag: GAMER_TAG, avatarId: 7 });
  });

  it("picks an avatar from a radio group and persists it", async () => {
    signedIn();
    api.profile = { gamerTag: GAMER_TAG, avatarId: 7 };
    renderAccount();

    const group = await screen.findByRole("group", { name: "Choose an avatar" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(116);
    expect(new Set(radios.map((radio) => radio.getAttribute("name")))).toEqual(new Set(["avatar"]));
    expect(within(group).getByRole("radio", { name: "Avatar 7" })).toBeChecked();
    const save = screen.getByRole("button", { name: "Save avatar" });
    expect(save).toBeDisabled();

    fireEvent.click(within(group).getByRole("radio", { name: "Avatar 42" }));
    expect(within(group).getByRole("radio", { name: "Avatar 42" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Avatar 7" })).not.toBeChecked();
    expect(group).toHaveTextContent("Preview");
    fireEvent.click(save);

    expect(await screen.findByText(PROFILE_COPY.avatarSaved)).toBeInTheDocument();
    expect(api.calls.at(-1)).toMatchObject({
      method: "PUT",
      path: "/api/profile/avatar",
      body: { avatarId: 42 },
    });
    expect(storedHint()).toEqual({ signedIn: true, gamerTag: GAMER_TAG, avatarId: 42 });
    expect(screen.getByRole("button", { name: "Save avatar" })).toBeDisabled();
  });

  it("offers a retry when the profile cannot load", async () => {
    signedIn();
    api.fail = true;
    renderAccount();

    expect(await screen.findByText(PROFILE_COPY.loadFailed)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Choose an avatar" })).not.toBeInTheDocument();
    expect(storedHint()).toEqual({ signedIn: true, gamerTag: null, avatarId: null });

    api.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("group", { name: "Choose an avatar" })).toBeInTheDocument();
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

    expect(await screen.findByRole("link", { name: /^Signed in as / })).toHaveAttribute(
      "href",
      "/account",
    );
    await waitFor(() => {
      expect(storedHint()).toEqual({ signedIn: true, gamerTag: null, avatarId: 7 });
    });
    expect(localStorage.getItem(ACCOUNT_HINT_KEY)).not.toContain(EMAIL);
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
    expect(screen.queryByRole("link", { name: /^Signed in as / })).not.toBeInTheDocument();
  });
});
