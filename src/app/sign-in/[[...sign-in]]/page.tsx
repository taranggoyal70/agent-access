import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return <main className="auth-page"><Link className="auth-brand" href="/">Agent Access</Link><SignIn /></main>;
}
