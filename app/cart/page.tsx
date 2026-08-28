import { CartView } from "@/components/cart-view";

export const metadata = {
  title: "Warenkorb",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display mb-8 text-4xl tracking-tight uppercase">
        Warenkorb
      </h1>
      <CartView />
    </div>
  );
}
