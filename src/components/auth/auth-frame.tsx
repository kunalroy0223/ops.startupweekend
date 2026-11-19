
import Image from "next/image";
import { ClipboardCheck, ListTodo, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { DrawIn, HeadlineReveal } from "@/components/motion/gsap-fx";
import { WiggleIcon } from "@/components/motion/anime-fx";

export function AuthFrame({
  children,
  headline,
  sticker = "Internal · Inhub E-Cell",
  showBrandPanel = true,
}: {
  children: ReactNode;
  headline?: ReactNode;
  sticker?: string;
  showBrandPanel?: boolean;
}) {
  return (
    <div
      className={`grid min-h-dvh ${showBrandPanel
          ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
          : "grid-cols-1"
        }`}
    >
      {showBrandPanel ? (
        <section
          aria-label="Inhub Workspace"
          className="relative flex flex-col overflow-hidden bg-[var(--brand-black)] text-white"
        >
          <div className="flex items-center justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
            <span className="inline-flex items-center rounded-[10px] bg-white px-3 py-2 shadow-[3px_3px_0_0_var(--brand-green)]">
              <Image
                src="/brand/inhub-ecell.png"
                alt="Inhub Entrepreneurship Cell"
                width={2715}
                height={1417}
                priority
                className="h-9 w-auto"
              />
            </span>
            <span className="sticker !border-white !bg-[var(--brand-black)] !text-white !shadow-[2px_2px_0_0_var(--brand-green)]">
              {sticker}
            </span>
          </div>

          <div className="relative flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:py-16">
            <p className="mb-4 font-mono text-[11px] tracking-[0.1em] text-[var(--brand-slate)] uppercase">
              Inhub Workspace
            </p>

            <HeadlineReveal className="display max-w-[14ch] text-[40px] text-white sm:text-[56px] xl:text-[68px]">
              {headline ?? (
                <>
                  Where the <span className="hl">work</span> gets done.
                </>
              )}
            </HeadlineReveal>

            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
              People, teams, tasks and daily reports for the Inhub E-Cell crew,
              in one place you can trust.
            </p>

            <ul className="mt-6 flex flex-wrap gap-2 text-[12px] font-semibold text-white/85">
              {[
                { icon: <Users className="size-3.5" />, t: "People & teams" },
                { icon: <ListTodo className="size-3.5" />, t: "Tasks" },
                {
                  icon: <ClipboardCheck className="size-3.5" />,
                  t: "Daily reports",
                },
                {
                  icon: <ShieldCheck className="size-3.5" />,
                  t: "Role-based access",
                },
              ].map((f) => (
                <li
                  key={f.t}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1"
                >
                  <span className="text-[var(--brand-green)]">{f.icon}</span>
                  {f.t}
                </li>
              ))}
            </ul>

            <BoardSketch />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-white px-6 py-4 text-black sm:px-10">
            <span className="font-mono text-[10px] tracking-[0.1em] text-[#4d6070] uppercase">
              Organising
            </span>

            <Image
              src="/brand/tsws-logo-on-light.png"
              alt="Techstars Startup Weekend Siliguri"
              width={438}
              height={194}
              className="h-9 w-auto"
            />

            <span
              className="hidden h-6 w-px bg-[#d9ded7] sm:block"
              aria-hidden
            />

            <Image
              src="/partners/inspiria.png"
              alt="Inspiria Knowledge Campus"
              width={400}
              height={100}
              className="h-6 w-auto"
            />

            <Image
              src="/partners/tie-siliguri.png"
              alt="TiE Siliguri"
              width={1446}
              height={491}
              className="h-6 w-auto"
            />
          </div>
        </section>
      ) : null}

      <main
        id="main"
        className="dotgrid flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8"
      >
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}

/** Custom illustration: three work artefacts (team, task, report) stacked with hard offsets. Decorative only. */
function BoardSketch() {
  return (
    <DrawIn className="pointer-events-none relative mt-12 hidden h-44 max-w-lg lg:block">
      <div aria-hidden="true">
        <svg
          className="absolute -top-6 left-40 h-24 w-40 overflow-visible"
          viewBox="0 0 160 96"
          fill="none"
        >
          <path
            data-draw
            d="M4 80 C 40 10, 100 10, 150 40"
            stroke="var(--brand-green)"
            strokeWidth="2.5"
            strokeDasharray="0"
            strokeLinecap="round"
          />
          <path
            data-draw
            d="M140 30 L152 41 L137 46"
            stroke="var(--brand-green)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div
          data-slide
          className="absolute top-6 left-0 w-56 rotate-[-4deg] rounded-[10px] border-2 border-white bg-[var(--brand-black)] p-3 shadow-[5px_5px_0_0_var(--brand-slate)]"
        >
          <p className="font-mono text-[10px] tracking-widest text-[var(--brand-slate)] uppercase">
            Team · Design
          </p>
          <div className="mt-2 flex">
            {["A", "R", "S", "+3"].map((t, i) => (
              <span
                key={t}
                className={`display grid size-7 place-items-center rounded-full border-2 border-white text-[10px] !tracking-normal ${i === 3
                    ? "bg-white text-black"
                    : "bg-[var(--brand-black)]"
                  } ${i ? "-ml-2" : ""}`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div
          data-slide
          className="absolute top-0 left-48 w-60 rotate-[3deg] rounded-[10px] border-2 border-black bg-[var(--brand-green)] p-3 text-black shadow-[5px_5px_0_0_#fff]"
        >
          <p className="font-mono text-[10px] tracking-widest uppercase">
            In review
          </p>
          <p className="mt-1 text-sm font-bold">
            Finalise mentor schedule
          </p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-black/20">
            <div
              data-pop
              className="h-full w-3/4 origin-left rounded-full bg-black"
            />
          </div>
        </div>

        <div
          data-slide
          className="absolute top-24 left-28 w-52 rotate-[-1deg] rounded-[10px] border-2 border-black bg-white p-3 text-black shadow-[5px_5px_0_0_var(--brand-green)]"
        >
          <p className="font-mono text-[10px] tracking-widest text-[#4d6070] uppercase">
            Daily report
          </p>
          <p className="mt-1 text-sm font-bold">3 tasks · 5h 20m</p>
        </div>

        <span
          data-pop
          className="absolute top-20 left-[26rem] grid size-10 place-items-center rounded-full border-2 border-black bg-white text-black shadow-[3px_3px_0_0_var(--brand-green)]"
        >
          <WiggleIcon>
            <ClipboardCheck className="size-5" />
          </WiggleIcon>
        </span>
      </div>
    </DrawIn>
  );
}

export function AuthCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="inked rounded-[var(--radius-feature)] bg-surface p-6 sm:p-8">
      <p className="eyebrow">{eyebrow}</p>
      <HeadlineReveal as="h2" className="display mt-2 text-[26px]">
        {title}
      </HeadlineReveal>
      <div className="mt-6">{children}</div>
    </div>
  );
}
