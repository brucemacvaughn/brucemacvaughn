import type { Cart, Product } from "./types";

const API_VERSION = "2025-01";

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

function endpoint() {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN;
  const token = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN;

  if (!domain || !token) {
    throw new Error(
      "Missing NEXT_PUBLIC_SHOPIFY_DOMAIN or NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN",
    );
  }

  return {
    url: `https://${domain}/api/${API_VERSION}/graphql.json`,
    token,
  };
}

async function storefront<T>(
  query: string,
  variables: Record<string, unknown> = {},
  cache: RequestCache | undefined = "force-cache",
): Promise<T> {
  const { url, token } = endpoint();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache,
    next: cache === "force-cache" ? { revalidate: 60 } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Shopify Storefront request failed (${res.status})`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Shopify Storefront returned no data");
  }
  return json.data;
}

type Connection<T> = {
  edges: { node: T }[];
};

function unwrap<T>(connection: Connection<T> | null | undefined): T[] {
  return connection?.edges.map((edge) => edge.node) ?? [];
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  productType
  vendor
  tags
  availableForSale
  featuredImage { url altText }
  images(first: 8) { edges { node { url altText } } }
  priceRange { minVariantPrice { amount currencyCode } }
  variants(first: 20) {
    edges {
      node {
        id
        title
        availableForSale
        price { amount currencyCode }
        selectedOptions { name value }
      }
    }
  }
`;

type ShopifyProduct = Omit<Product, "images" | "variants"> & {
  images: Connection<Product["images"][number]>;
  variants: Connection<Product["variants"][number]>;
};

function mapProduct(product: ShopifyProduct): Product {
  const images = unwrap(product.images);
  return {
    ...product,
    images:
      images.length > 0
        ? images
        : product.featuredImage
          ? [product.featuredImage]
          : [],
    variants: unwrap(product.variants),
  };
}

export async function getProducts(): Promise<Product[]> {
  const data = await storefront<{
    products: Connection<ShopifyProduct>;
  }>(`{ products(first: 50) { edges { node { ${PRODUCT_FIELDS} } } } }`);
  return unwrap(data.products).map(mapProduct);
}

export async function getProduct(handle: string): Promise<Product | null> {
  const data = await storefront<{ product: ShopifyProduct | null }>(
    `query Product($handle: String!) { product(handle: $handle) { ${PRODUCT_FIELDS} } }`,
    { handle },
  );
  return data.product ? mapProduct(data.product) : null;
}

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
  }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        cost { totalAmount { amount currencyCode } }
        merchandise {
          ... on ProductVariant {
            id
            title
            product {
              title
              handle
              featuredImage { url altText }
            }
            selectedOptions { name value }
            price { amount currencyCode }
          }
        }
      }
    }
  }
`;

type ShopifyCart = Omit<Cart, "lines"> & {
  lines: Connection<Cart["lines"][number]>;
};

function mapCart(cart: ShopifyCart): Cart {
  return {
    ...cart,
    lines: unwrap(cart.lines),
  };
}

type CartPayload = {
  cart: ShopifyCart | null;
  userErrors: { message: string }[];
};

function assertCart(payload: CartPayload, action: string): Cart {
  if (payload.userErrors.length) {
    throw new Error(payload.userErrors.map((error) => error.message).join("; "));
  }
  if (!payload.cart) {
    throw new Error(`${action} returned no cart`);
  }
  return mapCart(payload.cart);
}

export async function getCart(id: string): Promise<Cart | null> {
  const data = await storefront<{ cart: ShopifyCart | null }>(
    `query Cart($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`,
    { id },
    "no-store",
  );
  return data.cart ? mapCart(data.cart) : null;
}

export async function createCart(
  variantId: string,
  quantity: number,
): Promise<Cart> {
  const data = await storefront<{ cartCreate: CartPayload }>(
    `mutation CreateCart($lines: [CartLineInput!]!) {
      cartCreate(input: { lines: $lines }) {
        cart { ${CART_FIELDS} }
        userErrors { message }
      }
    }`,
    { lines: [{ merchandiseId: variantId, quantity }] },
    "no-store",
  );
  return assertCart(data.cartCreate, "cartCreate");
}

export async function addCartLines(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<Cart> {
  const data = await storefront<{ cartLinesAdd: CartPayload }>(
    `mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ${CART_FIELDS} }
        userErrors { message }
      }
    }`,
    { cartId, lines: [{ merchandiseId: variantId, quantity }] },
    "no-store",
  );
  return assertCart(data.cartLinesAdd, "cartLinesAdd");
}

export async function updateCartLine(
  cartId: string,
  lineId: string,
  quantity: number,
): Promise<Cart> {
  const data = await storefront<{ cartLinesUpdate: CartPayload }>(
    `mutation UpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ${CART_FIELDS} }
        userErrors { message }
      }
    }`,
    { cartId, lines: [{ id: lineId, quantity }] },
    "no-store",
  );
  return assertCart(data.cartLinesUpdate, "cartLinesUpdate");
}

export async function removeCartLine(
  cartId: string,
  lineId: string,
): Promise<Cart> {
  const data = await storefront<{ cartLinesRemove: CartPayload }>(
    `mutation RemoveLines($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ${CART_FIELDS} }
        userErrors { message }
      }
    }`,
    { cartId, lineIds: [lineId] },
    "no-store",
  );
  return assertCart(data.cartLinesRemove, "cartLinesRemove");
}
