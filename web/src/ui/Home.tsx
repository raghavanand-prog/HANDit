// The home page: one calm statement per screen, big type, a lot of space, one blue for actions.
import { firstName } from "../core/auth";
import { strings } from "../strings";
import { useApp } from "./app-context";
import { HandoffScene } from "./HandoffScene";
import { Reveal } from "./motion";
import { Link } from "./router";

const pill =
  "inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-lg font-semibold no-underline";

export function Home() {
  const { auth } = useApp();
  const text = strings.home;
  const canScan =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
  return (
    <div>
      <section className="px-4 pt-16 pb-12 text-center sm:pt-24">
        <p className="enter text-lg font-medium text-muted">
          {auth.user ? strings.signin.welcomeBack(firstName(auth.user.name)) : text.badge}
        </p>
        <h1
          tabIndex={-1}
          className="enter mx-auto mt-4 max-w-4xl font-display text-6xl leading-[1.02] font-semibold tracking-tighter text-balance outline-none sm:text-7xl lg:text-8xl"
          style={{ animationDelay: "60ms" }}
        >
          {text.headline}
        </h1>
        <p
          className="enter mx-auto mt-6 max-w-2xl text-xl text-muted text-balance sm:text-2xl"
          style={{ animationDelay: "120ms" }}
        >
          {text.lead}
        </p>
        <div
          className="enter mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "180ms" }}
        >
          <Link href="/send" className={`${pill} bg-accent text-accent-ink hover:opacity-90`}>
            {text.send}
          </Link>
          <Link href="/receive" className={`${pill} text-accent hover:bg-accent-soft`}>
            {text.receive}
          </Link>
        </div>
        <p
          className="enter mx-auto mt-6 max-w-xl text-sm text-muted"
          style={{ animationDelay: "220ms" }}
        >
          {text.laptopTip}
          {canScan && (
            <>
              {" "}
              <Link
                href="/scan"
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                {strings.scan.link}
              </Link>
            </>
          )}
        </p>
        <div className="enter mx-auto mt-14 max-w-3xl" style={{ animationDelay: "260ms" }}>
          <HandoffScene />
        </div>
      </section>

      {text.why.map((item, index) => (
        <section
          key={item.title}
          aria-labelledby={`why-${index}`}
          className={`px-4 py-28 text-center sm:py-40 ${index % 2 === 0 ? "bg-alt" : ""}`}
        >
          <Reveal>
            <h2
              id={`why-${index}`}
              className="mx-auto max-w-4xl font-display text-5xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-6xl lg:text-7xl"
            >
              {item.title}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-muted text-balance sm:text-2xl">
              {item.text}
            </p>
          </Reveal>
        </section>
      ))}

      <section aria-labelledby="steps" className="bg-alt px-4 py-28 sm:py-40">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2
              id="steps"
              className="text-center font-display text-5xl leading-[1.05] font-semibold tracking-tighter sm:text-6xl lg:text-7xl"
            >
              {text.stepsTitle}
            </h2>
          </Reveal>
          <ol className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
            {text.steps.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 120}>
                  <span
                    aria-hidden="true"
                    className="block font-display text-7xl font-semibold text-accent"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-lg text-muted">{step.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="platforms" className="px-4 py-24 text-center sm:py-32">
        <Reveal>
          <h2
            id="platforms"
            className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {text.platformsTitle}
          </h2>
          <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-3 text-2xl font-medium text-muted">
            {text.platforms.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Reveal>
      </section>
    </div>
  );
}
