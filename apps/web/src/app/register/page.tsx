import Link from "next/link";
import { AuthPageShell } from "@/components/auth-page-shell";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  const inviteToken = params.invite?.trim() ?? "";

  return (
    <AuthPageShell
      wide
      title="Accept your invitation"
      subtitle="Complete registration to join your organization workspace. You need a valid invite link from an administrator."
      footer={
        <Link href="/" className="text-slate-500 transition hover:text-slate-900">
          Back to home
        </Link>
      }
    >
      <RegisterForm inviteToken={inviteToken} />
    </AuthPageShell>
  );
}
