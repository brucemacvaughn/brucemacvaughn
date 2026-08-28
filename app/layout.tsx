import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { CartProvider } from "@/components/cart-provider";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { readCartId } from "@/lib/cart-cookie";
import { getCart } from "@/lib/shopify";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: {
    default: "Exzess Records",
    template: "%s · Exzess Records",
  },
  description:
    "Mensch & Maschine von Patrik Berg — Vinyl, Apparel und Bundles bei Exzess Records.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cartId = await readCartId();
  const cart = cartId ? await getCart(cartId) : null;

  return (
    <html
      lang="de"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <CartProvider initialCart={cart}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
