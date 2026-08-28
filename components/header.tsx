"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";

export function Header() {
  const { cart } = useCart();
  const count = cart?.totalQuantity ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="leading-none">
          <span className="font-display text-xl tracking-[0.22em] uppercase">
            Exzess
          </span>
          <span className="mt-0.5 block text-[10px] tracking-[0.28em] text-zinc-400 uppercase">
            Records
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-xs tracking-[0.18em] uppercase">
          <Link href="/" className="text-zinc-300 hover:text-white">
            Shop
          </Link>
          <Link href="/cart" className="relative text-zinc-300 hover:text-white">
            Warenkorb
            {count > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center bg-white px-1 text-[10px] font-medium text-black">
                {count}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}
