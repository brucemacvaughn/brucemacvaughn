import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="font-display text-4xl tracking-tight uppercase">
        Nicht gefunden
      </h1>
      <p className="mt-4 text-zinc-400">Diese Seite gibt es nicht.</p>
      <Link
        href="/"
        className="mt-8 inline-block border border-white/20 px-4 py-2 text-xs tracking-[0.18em] uppercase hover:border-white"
      >
        Zurück zum Shop
      </Link>
    </div>
  );
}
