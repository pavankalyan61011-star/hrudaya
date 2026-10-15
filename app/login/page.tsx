import { LoginForm } from "./login-form";
import { SyntheticNotice } from "@/components/synthetic-notice";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Hrudaya</h1>
        <p className="text-slate-600">Cath lab procedure record</p>
      </div>
      <SyntheticNotice />
      <div className="card">
        <LoginForm next={searchParams.next} />
      </div>
    </main>
  );
}
