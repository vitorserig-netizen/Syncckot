import { z } from "zod";

const SYNCPAY_CLIENT_ID = process.env.SYNCPAY_CLIENT_ID ?? "16b2513f-382c-49cf-ae49-6dfecb1d6656";
const SYNCPAY_CLIENT_SECRET = process.env.SYNCPAY_CLIENT_SECRET ?? "a7f45d7d-a6b0-4793-adbc-b6daf68b560c";

export const checkoutSchema = z.object({
  name: z.string().min(3, "Informe seu nome completo").max(120),
  email: z.string().email("Informe um email válido").max(160),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve conter 11 números"),
  phone: z.string().regex(/^\d{10,13}$/, "Celular deve conter DDD e número"),
  includeAddon: z.boolean().default(false),
  phoneModel: z.string(),
  browser: z.string(),
  batteryLevel: z.number().min(0).max(100),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

type SyncPayTokenResponse = {
  access_token?: string;
  accessToken?: string;
  token_type?: string;
  expires_in?: number;
};

type SyncPayCashInResponse = {
  message?: string;
  pix_code?: string;
  pixCode?: string;
  paymentCode?: string;
  identifier?: string;
  idTransaction?: string;
};

function getClientIp(request: Request | undefined) {
  return (
    request?.headers.get("cf-connecting-ip") ??
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"
  );
}

async function readSyncPayError(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function createPixPaymentForCheckout(input: CheckoutInput, request?: Request) {
  const data = checkoutSchema.parse(input);
  const clientSecret = process.env.SYNCPAY_CLIENT_SECRET ?? SYNCPAY_CLIENT_SECRET;
  const syncPayApiBase = process.env.SYNCPAY_API_BASE ?? "https://api.syncpayments.com.br";

  if (!clientSecret) {
    throw new Error("Credencial SyncPay não configurada.");
  }

  const normalizedPhone = data.phone.length > 11 && data.phone.startsWith("55") ? data.phone.slice(2) : data.phone;
  const trustedAmount = Number((7 + (data.includeAddon ? 9.9 : 0) + 0.99).toFixed(2));
  const trustedDescription = data.includeAddon
    ? "Odair José - A Promessa Que Fiz Por Amor (Livro Digital) + apoio ao livro físico"
    : "Odair José - A Promessa Que Fiz Por Amor (Livro Digital)";

  const tokenResponse = await fetch(`${syncPayApiBase}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SYNCPAY_CLIENT_ID,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    console.error("SyncPay auth error", await readSyncPayError(tokenResponse));
    throw new Error("Não foi possível autenticar na SyncPay. Verifique suas credenciais e IP autorizado.");
  }

  const tokenData = (await tokenResponse.json()) as SyncPayTokenResponse;
  const accessToken = tokenData.access_token ?? tokenData.accessToken;

  if (!accessToken) {
    throw new Error("A SyncPay não retornou um token de acesso válido.");
  }

  const origin = request ? new URL(request.url).origin : undefined;

  let cashInResponse = await fetch(`${syncPayApiBase}/api/partner/v1/cash-in`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      amount: trustedAmount,
      description: trustedDescription,
      webhook_url: origin ? `${origin}/api/public/syncpay-webhook` : undefined,
      client: {
        name: data.name,
        cpf: data.cpf,
        email: data.email,
        phone: normalizedPhone,
      },
    }),
  });

  if (!cashInResponse.ok) {
    console.error("SyncPay auth error", await readSyncPayError(tokenResponse));
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    cashInResponse = await fetch(`${syncPayApiBase}/v1/gateway/api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ip: getClientIp(request),
        pix: { expiresInDays: tomorrow },
        items: [{ title: trustedDescription, quantity: 1, tangible: false, unitPrice: trustedAmount }],
        amount: trustedAmount,
        customer: {
          cpf: data.cpf,
          name: data.name,
          email: data.email,
          phone: normalizedPhone,
          externaRef: crypto.randomUUID(),
          address: {
            city: "São Paulo",
            state: "SP",
            street: "Não informado",
            country: "BR",
            zipCode: "00000-000",
            complement: "Checkout digital",
            neighborhood: "Centro",
            streetNumber: "0",
          },
        },
        metadata: {
          provider: "SyncPay",
          sell_url: origin ?? "https://checkout.local",
          order_url: origin ?? "https://checkout.local",
          user_email: data.email,
          user_identitication_number: data.cpf,
        },
        traceable: true,
        postbackUrl: origin ? `${origin}/api/public/syncpay-webhook` : "https://checkout.local/api/public/syncpay-webhook",
      }),
    });

    if (!cashInResponse.ok) {
      console.error("SyncPay gateway fallback error", await readSyncPayError(cashInResponse));
      throw new Error("Não foi possível gerar o PIX agora. Confira os dados e tente novamente.");
    }
  }

  const cashInData = (await cashInResponse.json()) as SyncPayCashInResponse;
  const pixCode = cashInData.pix_code ?? cashInData.pixCode ?? cashInData.paymentCode;

  if (!pixCode) {
    throw new Error("A SyncPay não retornou o código PIX.");
  }

  const webhookPayload = {
    type: "pix_generated",
    name: data.name,
    email: data.email,
    cpf: data.cpf,
    phone: normalizedPhone,
    amount: trustedAmount,
    phoneModel: data.phoneModel,
    browser: data.browser,
    batteryLevel: data.batteryLevel,
    timestamp: new Date().toISOString(),
  };

  if (origin) {
    fetch(`${origin}/api/public/remarketing-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    }).catch(() => {
      // Ignore webhook errors to not block PIX generation.
    });
  }

  return {
    pixCode,
    identifier: cashInData.identifier ?? cashInData.idTransaction ?? "",
    message: cashInData.message ?? "PIX gerado com sucesso.",
    amount: trustedAmount,
  };
}
