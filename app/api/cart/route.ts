import { NextResponse } from "next/server";
import { readCartId, writeCartId } from "@/lib/cart-cookie";
import {
  addCartLines,
  createCart,
  getCart,
  removeCartLine,
  updateCartLine,
} from "@/lib/shopify";
import type { Cart } from "@/lib/types";

export const dynamic = "force-dynamic";

function json(cart: Cart | null, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ cart, ...extra });
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Cart request failed";
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const cartId = await readCartId();
    if (!cartId) return json(null);
    const cart = await getCart(cartId);
    return json(cart);
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      variantId?: string;
      lineId?: string;
      quantity?: number;
    };
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    const cartId = await readCartId();

    if (body.action === "add") {
      if (!body.variantId) {
        return errorResponse("variantId is required");
      }
      const cart = cartId
        ? await addCartLines(cartId, body.variantId, quantity)
        : await createCart(body.variantId, quantity);
      await writeCartId(cart.id);
      return json(cart);
    }

    if (!cartId) {
      return errorResponse("Cart is empty");
    }

    if (body.action === "update") {
      if (!body.lineId) return errorResponse("lineId is required");
      const cart = await updateCartLine(cartId, body.lineId, quantity);
      return json(cart);
    }

    if (body.action === "remove") {
      if (!body.lineId) return errorResponse("lineId is required");
      const cart = await removeCartLine(cartId, body.lineId);
      return json(cart);
    }

    return errorResponse("Unknown cart action");
  } catch (error) {
    return errorResponse(error, 500);
  }
}
