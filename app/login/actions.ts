"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signInWithPassword, signOut } from "@/lib/queries/auth";

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

/** Only same-site relative paths, so `next` can never send someone off-site. */
function safeNext(next: string | undefined) {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/procedures";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const { ok } = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!ok) return { error: "Email or password is incorrect." };

  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await signOut();
  redirect("/login");
}
