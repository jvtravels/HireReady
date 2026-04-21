import type { Metadata } from "next";
import SignUp from "@/SignUp";

export const metadata: Metadata = {
  title: "Log In | HireStepX",
  description:
    "Log in to your HireStepX account to continue practicing interviews.",
};

export default function Page() {
  return <SignUp isLogin />;
}
