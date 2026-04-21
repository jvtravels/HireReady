import { vi } from "vitest";
import React from "react";

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const mockPathname = "/dashboard";
export const mockSearchParams = new URLSearchParams();

const useParamsMock = vi.fn(() => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useParams: useParamsMock,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    return React.createElement("a", { href, ...props }, children);
  },
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    return React.createElement("img", props);
  },
}));
