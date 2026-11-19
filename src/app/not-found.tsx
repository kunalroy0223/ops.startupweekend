import { LinkButton } from "@/components/ui/button";
import { Orbit } from "@/components/ui/signal";

export default function NotFound() {
  return (
    <main id="main" className="dotgrid grid min-h-dvh place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <Orbit className="size-24" />
        <p className="sticker">404 · not here</p>
        <h1 className="display text-3xl">
          Nothing at this <span className="hl">address</span>.
        </h1>
        <p className="text-sm text-fg-2">The page may have moved, or you may not have access to it.</p>
        <LinkButton href="/overview" variant="primary">
          Back to overview
        </LinkButton>
      </div>
    </main>
  );
}
