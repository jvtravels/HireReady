import { describe, it, expect } from "vitest";
import { supabaseConfigured } from "../supabase";

describe("supabase", () => {
  it("supabaseConfigured is false when env vars not set", () => {
    // In test environment, no NEXT_PUBLIC_SUPABASE_URL is set
    expect(supabaseConfigured).toBe(false);
  });
});
