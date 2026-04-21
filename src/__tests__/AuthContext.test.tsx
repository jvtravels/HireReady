import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "./setup-next-navigation";
import { AuthProvider, useAuth, RequireAuth } from "../AuthContext";

// Mock supabase
vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
      signOut: vi.fn(() => Promise.resolve()),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ error: null })),
      resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
  supabaseConfigured: false,
  getProfile: vi.fn(),
  upsertProfile: vi.fn(),
}));

function TestConsumer() {
  const { user, isLoggedIn, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="loggedIn">{String(isLoggedIn)}</span>
      <span data-testid="userName">{user?.name || "none"}</span>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("provides initial unauthenticated state when supabase not configured", () => {
    render(
      
        <AuthProvider><TestConsumer /></AuthProvider>
      ,
    );
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("throws when useAuth used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });

  it("RequireAuth redirects to login when not authenticated", () => {
    render(
      
        <AuthProvider>
          <RequireAuth><div data-testid="protected">Protected</div></RequireAuth>
        </AuthProvider>
      ,
    );
    // Should not render protected content
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("login with localStorage fallback creates user", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: capturing hook function dynamically
    let loginFn: any;
    function LoginConsumer() {
      const auth = useAuth();
      loginFn = auth.login;
      return <span data-testid="loggedIn">{String(auth.isLoggedIn)}</span>;
    }

    render(
      
        <AuthProvider><LoginConsumer /></AuthProvider>
      ,
    );

    expect(screen.getByTestId("loggedIn").textContent).toBe("false");
    await act(async () => {
      const result = await loginFn("test@example.com", "password123");
      expect(result.success).toBe(true);
    });
    expect(screen.getByTestId("loggedIn").textContent).toBe("true");
  });

  it("signup with localStorage fallback creates user with name", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: capturing hook function dynamically
    let signupFn: any;
    function SignupConsumer() {
      const auth = useAuth();
      signupFn = auth.signup;
      return <span data-testid="userName">{auth.user?.name || "none"}</span>;
    }

    render(
      
        <AuthProvider><SignupConsumer /></AuthProvider>
      ,
    );

    await act(async () => {
      const result = await signupFn("test@example.com", "Test User", "password123");
      expect(result.success).toBe(true);
    });
    expect(screen.getByTestId("userName").textContent).toBe("Test User");
  });

  it("logout clears user state", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: capturing hook functions dynamically
    let loginFn: any, logoutFn: any;
    function Consumer() {
      const auth = useAuth();
      loginFn = auth.login;
      logoutFn = auth.logout;
      return <span data-testid="loggedIn">{String(auth.isLoggedIn)}</span>;
    }

    render(
      
        <AuthProvider><Consumer /></AuthProvider>
      ,
    );

    await act(async () => { await loginFn("test@example.com", "pass"); });
    expect(screen.getByTestId("loggedIn").textContent).toBe("true");

    await act(async () => { await logoutFn(); });
    expect(screen.getByTestId("loggedIn").textContent).toBe("false");
  });

  it("updateUser merges updates correctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: capturing hook functions dynamically
    let loginFn: any, updateFn: any;
    function Consumer() {
      const auth = useAuth();
      loginFn = auth.login;
      updateFn = auth.updateUser;
      return (
        <div>
          <span data-testid="name">{auth.user?.name || "none"}</span>
          <span data-testid="role">{auth.user?.targetRole || "none"}</span>
        </div>
      );
    }

    render(
      
        <AuthProvider><Consumer /></AuthProvider>
      ,
    );

    await act(async () => { await loginFn("test@example.com", "pass"); });
    await act(async () => { await updateFn({ targetRole: "Engineering Manager" }); });
    expect(screen.getByTestId("role").textContent).toBe("Engineering Manager");
  });
});
