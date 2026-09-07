import { formatEther, parseEther } from "viem";
export function totalPrice(units: number, price = "0"): string {
  if (
    !Number.isSafeInteger(units) ||
    units < 1 ||
    !/^\d+(\.\d{1,18})?$/.test(price)
  )
    return "—";
  return formatEther(parseEther(price) * BigInt(units));
}
