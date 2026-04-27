import { createFileRoute } from "@tanstack/react-router";
import { checkoutSchema, createPixPaymentForCheckout } from "../syncpay-core";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export const Route = createFileRoute("/api/public/create-pix")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = checkoutSchema.safeParse(body);

          if (!parsed.success) {
            return jsonResponse({ error: parsed.error.errors[0]?.message ?? "Confira os dados." }, 400);
          }

          const pix = await createPixPaymentForCheckout(parsed.data, request);
          return jsonResponse(pix);
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : "Não foi possível gerar o PIX agora." },
            500,
          );
        }
      },
    },
  },
});
