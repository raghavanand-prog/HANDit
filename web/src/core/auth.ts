// Optional sign-in, from the page's side. Everything here is skipped if the server offers no
// provider; nothing in HANDit needs an account.
export interface Providers {
  github: boolean;
  google: boolean;
}
export interface User {
  name: string;
  provider: "github" | "google";
}
export interface AuthState {
  /** False until the first answer from the server arrives. */
  ready: boolean;
  providers: Providers;
  user: User | null;
}

export const SIGNED_OUT: AuthState = {
  ready: false,
  providers: { github: false, google: false },
  user: null,
};

export async function loadAuth(): Promise<AuthState> {
  try {
    // One request: who is signed in, and which providers the server offers.
    const me = (await fetch("/auth/me", { credentials: "same-origin" }).then((r) => r.json())) as {
      user: User | null;
      providers: Providers;
    };
    return { ready: true, providers: me.providers, user: me.user };
  } catch {
    // Offline, or an older server: carry on as a guest.
    return { ...SIGNED_OUT, ready: true };
  }
}

export async function signOut(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}

export const anyProvider = (providers: Providers) => providers.github || providers.google;

/** "Ravi Kumar" -> "Ravi". */
export const firstName = (name: string) => name.split(" ")[0] ?? name;
