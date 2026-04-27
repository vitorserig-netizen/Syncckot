import { $ as TSS_SERVER_FUNCTION, a0 as createServerFn, a1 as getRequest } from "./worker-entry-mbh3SfAh.js";
import { c as checkoutSchema, a as createPixPaymentForCheckout } from "./syncpay-core-CPQjJumF.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
var createServerRpc = (serverFnMeta, splitImportFn) => {
  const url = "/_serverFn/" + serverFnMeta.id;
  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const createPixPayment_createServerFn_handler = createServerRpc({
  id: "3bc294a0a9fe012158cd09382eee91a99701720732837525f3eb73fc19a80264",
  name: "createPixPayment",
  filename: "src/syncpay.functions.ts"
}, (opts) => createPixPayment.__executeServer(opts));
const createPixPayment = createServerFn({
  method: "POST"
}).inputValidator((input) => {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Confira os dados do pagamento.");
  }
  return parsed.data;
}).handler(createPixPayment_createServerFn_handler, async ({
  data
}) => createPixPaymentForCheckout(data, getRequest()));
export {
  createPixPayment_createServerFn_handler
};
