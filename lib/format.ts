import type { Money, ProductOption } from "./types";

export function formatMoney(money: Money, locale = "de-DE") {
  const amount = Number.parseFloat(money.amount);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(amount);
}

export function optionLabel(options: ProductOption[]) {
  return options.map((option) => option.value).join(" · ");
}
