import type { Metadata } from "next";
import ResetPassword from "@/ResetPassword";

export const metadata: Metadata = {
  title: "Reset Password | HireStepX",
  description: "Reset your HireStepX account password.",
};

export default function Page() {
  return <ResetPassword />;
}
