import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8f2e6_0%,#eff3fa_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <LoginForm />
      </div>
    </main>
  );
}
