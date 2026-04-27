import { createFileRoute } from "@tanstack/react-router";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ??
  "https://discord.com/api/webhooks/1498150071349284925/Rhg9uUqteSPVKhJTNjgfeZflxqw8CEqTuLyWLI68d3QB4H31qX5oJTqDzL1TCEnbcKs3";

export const Route = createFileRoute("/api/public/syncpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => null);
        console.info("SyncPay webhook received", payload);

        if (!DISCORD_WEBHOOK_URL) {
          return Response.json({ received: true, forwarded: false, message: "Discord webhook não configurado." });
        }

        const payloadText = payload ? JSON.stringify(payload, null, 2).slice(0, 1900) : "Nenhum payload recebido.";

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "✅ Novo webhook SyncPay recebido",
            embeds: [
              {
                title: "SyncPay Webhook",
                description: payloadText,
              },
            ],
          }),
        }).catch((error) => {
          console.error("Erro ao enviar webhook para Discord", error);
          return null;
        });

        if (discordResponse && !discordResponse.ok) {
          console.error("Discord webhook retornou erro", await discordResponse.text().catch(() => ""));
        }

        return Response.json({ received: true, forwarded: !!discordResponse, discordOk: discordResponse?.ok ?? false });
      },
    },
  },
});
