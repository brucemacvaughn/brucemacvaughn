import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/shopify";
import type { Product } from "@/lib/types";

export const revalidate = 60;

const GROUPS = [
  { title: "Musik", types: ["Vinyl", "Digital"] },
  { title: "Apparel", types: ["T-Shirt"] },
  { title: "Bundles", types: ["Bundle"] },
] as const;

function byType(products: Product[], types: readonly string[]) {
  return products.filter((product) => types.includes(product.productType));
}

export default async function Home() {
  const products = await getProducts();
  const grouped = GROUPS.map((group) => ({
    ...group,
    products: byType(products, group.types),
  })).filter((group) => group.products.length > 0);
  const leftover = products.filter(
    (product) =>
      !GROUPS.some((group) =>
        (group.types as readonly string[]).includes(product.productType),
      ),
  );

  return (
    <div>
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-[11px] tracking-[0.32em] text-zinc-400 uppercase">
            Exzess Records
          </p>
          <h1 className="font-display mt-4 max-w-3xl text-5xl leading-[0.9] tracking-tight uppercase sm:text-7xl">
            Mensch &amp; Maschine
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">
            Das Debüt-Konzeptalbum von Patrik Berg — signiertes Vinyl, Limited
            Apparel und Bundles. Printed in Köln.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        {grouped.map((group) => (
          <section key={group.title}>
            <h2 className="mb-6 text-[11px] tracking-[0.28em] text-zinc-500 uppercase">
              {group.title}
            </h2>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {group.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ))}
        {leftover.length > 0 ? (
          <section>
            <h2 className="mb-6 text-[11px] tracking-[0.28em] text-zinc-500 uppercase">
              Mehr
            </h2>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {leftover.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
