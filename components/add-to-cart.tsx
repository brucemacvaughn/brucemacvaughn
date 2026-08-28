"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";
import type { Product } from "@/lib/types";

export function AddToCart({ product }: { product: Product }) {
  const router = useRouter();
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionName = product.variants[0]?.selectedOptions[0]?.name ?? "Option";
  const selected = useMemo(
    () => product.variants.find((variant) => variant.id === variantId),
    [product.variants, variantId],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!variantId) return;
    setPending(true);
    setError(null);
    try {
      await addItem(variantId, 1);
      router.push("/cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte nicht hinzugefügt werden");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      {product.variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-[11px] tracking-[0.2em] text-zinc-400 uppercase">
            {optionName}
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((variant) => {
              const label = variant.selectedOptions[0]?.value ?? variant.title;
              const active = variant.id === variantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={!variant.availableForSale}
                  onClick={() => setVariantId(variant.id)}
                  className={`min-w-12 border px-3 py-2 text-sm ${
                    active
                      ? "border-white bg-white text-black"
                      : "border-white/20 text-zinc-200 hover:border-white/60"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <button
        type="submit"
        disabled={pending || !selected?.availableForSale}
        className="w-full bg-white px-4 py-3 text-sm tracking-[0.2em] text-black uppercase hover:bg-zinc-200 disabled:opacity-50"
      >
        {pending ? "Wird hinzugefügt…" : "In den Warenkorb"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </form>
  );
}
