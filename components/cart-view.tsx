"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMoney, optionLabel } from "@/lib/format";
import { useCart } from "./cart-provider";

export function CartView() {
  const { cart, loading, error, updateLine, removeLine } = useCart();

  if (loading) {
    return <p className="text-sm text-zinc-400">Warenkorb wird geladen…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-400">Dein Warenkorb ist leer.</p>
        <Link
          href="/"
          className="inline-block border border-white/20 px-4 py-2 text-xs tracking-[0.18em] uppercase hover:border-white"
        >
          Zurück zum Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <ul className="divide-y divide-white/10 border-y border-white/10">
        {cart.lines.map((line) => {
          const image = line.merchandise.product.featuredImage;
          return (
            <li key={line.id} className="flex gap-4 py-6">
              <div className="relative h-28 w-24 shrink-0 overflow-hidden bg-zinc-900">
                {image ? (
                  <Image
                    src={image.url}
                    alt={image.altText || line.merchandise.product.title}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/product/${line.merchandise.product.handle}`}
                      className="text-sm hover:underline"
                    >
                      {line.merchandise.product.title}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {optionLabel(line.merchandise.selectedOptions)}
                    </p>
                  </div>
                  <p className="text-sm">{formatMoney(line.cost.totalAmount)}</p>
                </div>
                <div className="mt-auto flex items-center gap-3 pt-4">
                  <label className="text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
                    Menge
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next >= 1) {
                          void updateLine(line.id, next);
                        }
                      }}
                      className="ml-2 w-16 border border-white/20 bg-transparent px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void removeLine(line.id)}
                    className="text-xs tracking-[0.14em] text-zinc-500 uppercase hover:text-white"
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="h-fit border border-white/10 p-6">
        <p className="flex items-center justify-between text-sm">
          <span className="tracking-[0.16em] text-zinc-400 uppercase">Summe</span>
          <span>{formatMoney(cart.cost.totalAmount)}</span>
        </p>
        <a
          href={cart.checkoutUrl}
          className="mt-6 block bg-white px-4 py-3 text-center text-sm tracking-[0.2em] text-black uppercase hover:bg-zinc-200"
        >
          Zur Kasse
        </a>
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">
          Checkout läuft über Shopify. Versand und Steuern werden dort berechnet.
        </p>
      </aside>
    </div>
  );
}
