import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { checkoutSchema, createPixPaymentForCheckout } from "./syncpay-core";

export const createPixPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => {
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message ?? "Confira os dados do pagamento.");
    }
    return parsed.data;
  })
  .handler(async ({ data }) => createPixPaymentForCheckout(data, getRequest()));
