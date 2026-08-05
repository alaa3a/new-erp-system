import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Nexus",
  description: "Sign in to your Nexus account",
};

export default function SignIn() {
  return <SignInForm />;
}
