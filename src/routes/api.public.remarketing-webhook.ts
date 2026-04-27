import { createFileRoute } from "@tanstack/react-router";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ??
  "https://discord.com/api/webhooks/1498150071349284925/Rhg9uUqteSPVKhJTNjgfeZflxqw8CEqTuLyWLI68d3QB4H31qX5oJTqDzL1TCEnbcKs3";

export const Route = createFileRoute("/api/public/remarketing-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text().catch(() => "");
        let payload: any = null;

        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = { raw: text };
        }

        console.info("Remarketing webhook received", payload);

        if (!DISCORD_WEBHOOK_URL) {
          return Response.json({ received: true, forwarded: false, message: "Discord webhook não configurado." });
        }

        const isSuccess = payload?.type === "pix_generated";
        const embedTitle = isSuccess ? "🎉 Novo Lead - PIX Gerado" : "⚠️ Tentativa de Checkout";

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: isSuccess ? "✅ Novo lead gerado com sucesso!" : "⚠️ Tentativa de checkout detectada",
            embeds: [
              {
                title: embedTitle,
                color: isSuccess ? 3066993 : 16753920,
                fields: [
                  { name: "👤 Nome", value: payload?.name ?? "-", inline: true },
                  { name: "📧 Email", value: payload?.email ?? "-", inline: true },
                  { name: "🆔 CPF", value: payload?.cpf ?? "-", inline: true },
                  { name: "📱 Telefone", value: payload?.phone ?? "-", inline: false },
                  { name: "💰 Valor", value: `R$ ${payload?.amount?.toFixed?.(2) ?? payload?.amount ?? "-"}`, inline: true },
                  { name: "📱 Modelo Telefone", value: payload?.phoneModel ?? "-", inline: true },
                  { name: "🌐 Navegador", value: payload?.browser ?? "-", inline: false },
                  { name: "🔋 Bateria", value: `${payload?.batteryLevel ?? "-"}%`, inline: true },
                  { name: "⏰ Hora", value: payload?.timestamp ?? new Date().toISOString(), inline: false },
                ],
              },
            ],
          }),
        }).catch((error) => {
          console.error("Erro ao enviar webhook de remarketing para Discord", error);
          return null;
        });

        if (discordResponse && !discordResponse.ok) {
          console.error("Discord remarketing webhook retornou erro", await discordResponse.text().catch(() => ""));
        }

        return Response.json({ received: true, forwarded: !!discordResponse, discordOk: discordResponse?.ok ?? false });
      },
    },
  },
});
