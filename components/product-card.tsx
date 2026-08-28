import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const image = product.featuredImage ?? product.images[0];

  return (
    <Link href={`/product/${product.handle}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-zinc-900">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText || product.title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            No image
          </div>
        )}
        {product.tags.includes("Limited") ? (
          <span className="absolute top-3 left-3 bg-black/80 px-2 py-1 text-[10px] tracking-[0.18em] text-white uppercase">
            Limited
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h3 className="text-sm leading-snug text-zinc-100">{product.title}</h3>
        <p className="shrink-0 text-sm text-zinc-300">
          {formatMoney(product.priceRange.minVariantPrice)}
        </p>
      </div>
      <p className="mt-1 text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
        {product.productType}
      </p>
    </Link>
  );
}
