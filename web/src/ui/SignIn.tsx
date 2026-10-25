// The sign-in page. Signing in is optional and says so; the guest path is always the clear way on.
import { anyProvider } from "../core/auth";
import { strings } from "../strings";
import { useApp } from "./app-context";
import { Link } from "./router";

const GithubMark = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-6 w-6 fill-current">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const GoogleMark = () => (
  <svg aria-hidden="true" viewBox="0 0 18 18" className="h-6 w-6">
    <path
      fill="#4285F4"
      d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 000 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
    />
    <path
      fill="#EA4335"
      d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4636.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
    />
  </svg>
);

const providerButton =
  "flex min-h-14 items-center justify-center gap-3 rounded-2xl border-2 border-ink px-5 py-3 text-lg font-semibold text-ink no-underline hover:bg-accent-soft";

export function SignInPage() {
  const { auth } = useApp();
  const failed = new URLSearchParams(location.search).has("error");
  const offered = anyProvider(auth.providers);
  const text = strings.signin;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="enter overflow-hidden rounded-[2rem] border border-line bg-surface shadow-xl">
        <div className="bg-accent px-6 py-8 text-accent-ink">
          <h1
            tabIndex={-1}
            className="font-display text-3xl font-extrabold tracking-tight outline-none"
          >
            {text.title}
          </h1>
          <p className="mt-2 opacity-90">{text.lead}</p>
        </div>
        <div className="space-y-3 p-6">
          {failed && (
            <p
              role="alert"
              className="rounded-xl border-l-4 border-danger bg-danger-soft px-4 py-3 text-sm"
            >
              {text.error}
            </p>
          )}
          {!offered && auth.ready && (
            <p className="rounded-xl border-l-4 border-warn px-4 py-3 text-sm">
              {text.unavailable}
            </p>
          )}
          {/* Plain links, not router links: these leave the app for the provider. */}
          {auth.providers.github && (
            <a href="/auth/github/start" className={providerButton}>
              <GithubMark />
              {text.github}
            </a>
          )}
          {auth.providers.google && (
            <a href="/auth/google/start" className={providerButton}>
              <GoogleMark />
              {text.google}
            </a>
          )}
          <Link
            href="/"
            className="flex min-h-14 items-center justify-center rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink no-underline hover:opacity-90"
          >
            {text.guest}
          </Link>
        </div>
      </div>
      <section
        aria-labelledby="saved"
        className="enter rounded-3xl border border-line bg-surface p-5"
      >
        <h2 id="saved" className="font-display text-lg font-bold">
          {text.whatSaved}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {text.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
