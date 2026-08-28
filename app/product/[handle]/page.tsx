import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { ProductGallery } from "@/components/product-gallery";
import { formatMoney } from "@/lib/format";
import { getProduct, getProducts } from "@/lib/shopify";

export const revalidate = 60;

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((product) => ({ handle: product.handle }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const product = await getProduct(handle);
  if (!product) return { title: "Produkt" };
  return {
    title: product.title,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const product = await getProduct(handle);
  if (!product) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
      <ProductGallery images={product.images} title={product.title} />
      <div>
        <p className="text-[11px] tracking-[0.24em] text-zinc-500 uppercase">
          {product.productType}
          {product.tags.includes("Limited") ? " · Limited" : ""}
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight uppercase sm:text-5xl">
          {product.title}
        </h1>
        <p className="mt-4 text-lg">{formatMoney(product.priceRange.minVariantPrice)}</p>
        <p className="mt-6 max-w-prose text-sm leading-7 whitespace-pre-line text-zinc-400">
          {product.description}
        </p>
        <AddToCart product={product} />
      </div>
    </div>
  );
}
