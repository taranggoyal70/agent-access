import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return <main className="auth-page"><Link className="auth-brand" href="/">Agent Access</Link><SignUp /></main>;
}
