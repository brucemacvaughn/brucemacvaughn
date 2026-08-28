"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Cart } from "@/lib/types";

type CartContextValue = {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateLine: (lineId: string, quantity: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

async function cartRequest(payload?: Record<string, unknown>) {
  const res = await fetch("/api/cart", {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const json = (await res.json()) as { cart: Cart | null; error?: string };
  if (!res.ok) {
    throw new Error(json.error || "Cart request failed");
  }
  return json.cart;
}

export function CartProvider({
  children,
  initialCart,
}: {
  children: React.ReactNode;
  initialCart: Cart | null;
}) {
  const [cart, setCart] = useState<Cart | null>(initialCart);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await cartRequest();
      setCart(next);
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async (payload: Record<string, unknown>) => {
    setError(null);
    const next = await cartRequest(payload);
    setCart(next);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      error,
      refresh,
      addItem: (variantId, quantity = 1) =>
        run({ action: "add", variantId, quantity }),
      updateLine: (lineId, quantity) =>
        run({ action: "update", lineId, quantity }),
      removeLine: (lineId) => run({ action: "remove", lineId }),
    }),
    [cart, loading, error, refresh, run],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
