import { describe, it, expect } from "vitest";
import { profileToUser } from "../AuthContext";
import type { Profile } from "../supabase";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    name: "Jay Vyas",
    email: "jay@example.com",
    target_role: "",
    target_company: "",
    city: "",
    industry: "",
    interview_date: "",
    experience_level: "",
    learning_style: "",
    preferred_session_length: 25,
    interview_types: [],
    resume_file_name: "",
    resume_text: "",
    resume_data: null,
    resume_version_id: null,
    practice_timestamps: [],
    avatar_url: "",
    subscription_tier: "free",
    subscription_start: null,
    subscription_end: null,
    cancel_at_period_end: false,
    subscription_paused: false,
    has_completed_onboarding: true,
    razorpay_payment_id: null,
    razorpay_subscription_id: null,
    referral_code: null,
    referred_by: null,
    deleted_at: null,
    is_discoverable_to_employers: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(providers: string[], provider: string) {
  return {
    user: {
      id: "user-1",
      email: "jay@example.com",
      user_metadata: {},
      app_metadata: { provider, providers },
      email_confirmed_at: null,
    },
  } as unknown as Parameters<typeof profileToUser>[1];
}

describe("profileToUser — signedInVia", () => {
  it("reports 'email' for a dual-provider account even when the current session's provider is google", () => {
    const user = profileToUser(makeProfile(), makeSession(["email", "google"], "google"));
    expect(user.signedInVia).toBe("email");
  });

  it("reports 'google' for a google-only account", () => {
    const user = profileToUser(makeProfile(), makeSession(["google"], "google"));
    expect(user.signedInVia).toBe("google");
  });

  it("reports 'email' for an email-only account", () => {
    const user = profileToUser(makeProfile(), makeSession(["email"], "email"));
    expect(user.signedInVia).toBe("email");
  });
});
