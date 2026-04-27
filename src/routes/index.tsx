import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { createPixPayment } from "../syncpay.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

export const Route = createFileRoute("/")({
  component: CheckoutPage,
});

const mainProduct = {
  title: "Odair José - A Promessa Que Fiz Por Amor (Livro Digital)",
  price: 7,
  image: "/livro-promessa.png",
};

const addonProduct = {
  title: "Apoie o lançamento do livro físico!",
  description: "Contribua com apenas R$ 9,90 e ajude a viabilizar a produção e o lançamento do livro físico.",
  price: 9.9,
  image: "/apoio-livro.png",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePhone(value: string) {
  const digits = onlyDigits(value);
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2, 13) : digits.slice(0, 11);
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log('Audio not supported');
  }
}

function CheckoutPage() {
  const createPix = useServerFn(createPixPayment);
  const [form, setForm] = useState({ name: "", email: "", confirmEmail: "", cpf: "", phone: "" });
  const [includeAddon, setIncludeAddon] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeNotifications, setActiveNotifications] = useState<Array<{ id: number; message: string; timestamp: number }>>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [hasReportedIncompleteAttempt, setHasReportedIncompleteAttempt] = useState(false);

  const randomNames = [
    "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Fernando", "Gabriela", "Henrique", "Isabela", "João",
    "Karina", "Lucas", "Mariana", "Nicolas", "Olivia", "Pedro", "Quintino", "Rafael", "Sofia", "Tiago",
    "Ursula", "Vinicius", "Wanda", "Xavier", "Yasmin", "Zoe", "Alberto", "Beatriz", "Caio", "Daniela"
  ];

  const notificationTemplates = [
    "🔥 {name} acabou de aproveitar a oferta e garantir o livro",
    "✨ {name} acabou de comprar o livro com PIX",
    "🚀 {name} garantiu o livro agora mesmo",
    "💥 {name} não perdeu a oferta e comprou o livro",
    "🎉 {name} aproveitou a oportunidade e comprou o livro",
    "✅ {name} acabou de finalizar a compra do livro"
  ];

  const qrCodeUrl = useMemo(
    () => (pixCode ? `https://api.qrserver.com/v1/create-qr-code?size=320x320&data=${encodeURIComponent(pixCode)}` : ""),
    [pixCode],
  );

  const reportIncompleteCheckout = (reason: string) => {
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();

    if (!trimmedName && !trimmedEmail && !form.phone && !form.cpf) {
      return;
    }

    const payload = {
      type: "incomplete_checkout",
      reason,
      name: trimmedName,
      email: trimmedEmail,
      cpf: onlyDigits(form.cpf),
      phone: normalizePhone(form.phone),
      includeAddon,
      timestamp: new Date().toISOString(),
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/public/remarketing-webhook", blob);
      return;
    }

    fetch("/api/public/remarketing-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // silenciar erro de remarketing
    });
  };

  const addNotification = (name?: string) => {
    const notificationName = name || randomNames[Math.floor(Math.random() * randomNames.length)];
    const template = notificationTemplates[Math.floor(Math.random() * notificationTemplates.length)];
    const message = template.replace("{name}", notificationName);
    const id = Date.now();
    setActiveNotifications(prev => [...prev, { id, message, timestamp: id }]);

    // Tocar som de notificação
    playNotificationSound();

    setTimeout(() => {
      setActiveNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    const autoNotificationInterval = setInterval(() => {
      addNotification();
    }, 7000); // Notificação automática a cada 7 segundos
    return () => clearInterval(autoNotificationInterval);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pixCode || status === "success") {
        return;
      }

      if (hasReportedIncompleteAttempt) {
        return;
      }

      if (form.name.trim() || form.email.trim() || form.phone || form.cpf) {
        reportIncompleteCheckout("user_left_before_purchase");
        setHasReportedIncompleteAttempt(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form, hasReportedIncompleteAttempt, pixCode, status]);

  const serviceFee = 0.99;
  const subtotal = useMemo(() => mainProduct.price + (includeAddon ? addonProduct.price : 0), [includeAddon]);
  const total = useMemo(() => subtotal + serviceFee, [subtotal]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPixCode("");
    setCopied(false);

    if (form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
      setError("Os emails informados não conferem.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    // Collect device information
    const userAgent = navigator.userAgent;
    let phoneModel = 'Unknown';
    if (/iPhone/i.test(userAgent)) phoneModel = 'iPhone';
    else if (/Android/i.test(userAgent)) phoneModel = 'Android';
    else if (/Windows Phone/i.test(userAgent)) phoneModel = 'Windows Phone';
    else if (/BlackBerry/i.test(userAgent)) phoneModel = 'BlackBerry';
    else if (/iPad/i.test(userAgent)) phoneModel = 'iPad';
    else if (/iPod/i.test(userAgent)) phoneModel = 'iPod';
    else if (/Linux/i.test(userAgent) && /Mobile/i.test(userAgent)) phoneModel = 'Android';
    else if (/Mac/i.test(userAgent)) phoneModel = 'Mac';
    else if (/Windows/i.test(userAgent)) phoneModel = 'Windows';

    let batteryLevel = 0;
    try {
      const battery = await navigator.getBattery();
      batteryLevel = Math.round(battery.level * 100);
    } catch (e) {
      // Battery API not supported
    }

    try {
      const result = await createPix({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          cpf: onlyDigits(form.cpf),
          phone: normalizePhone(form.phone),
          includeAddon,
          phoneModel,
          browser: userAgent,
          batteryLevel,
        },
      });
      setPixCode(result.pixCode);
      setStatus("success");
      setIsPaymentModalOpen(true);
      addNotification(form.name.trim()); // Adiciona notificação com o nome do comprador
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Não foi possível gerar o PIX agora.");
      reportIncompleteCheckout("payment_generation_error");
      setStatus("error");
    }
  };

  const copyPix = async () => {
    if (!pixCode) return;
    await navigator.clipboard.writeText(pixCode);
    setCopied(true);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:py-8">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
        <form onSubmit={submitPayment} className="checkout-shadow rounded-lg border border-border bg-card p-5 sm:p-7 lg:p-8">
          <section className="flex gap-4">
            <img
              src={mainProduct.image}
              alt="Capa do livro A Promessa Que Fiz Por Amor"
              className="h-24 w-20 rounded-md border border-border object-cover shadow-sm"
            />
            <div className="pt-1">
              <p className="text-xl font-extrabold leading-tight sm:text-2xl">{mainProduct.title}</p>
              <p className="mt-1 text-lg font-semibold text-primary">{formatCurrency(mainProduct.price)} à vista</p>
            </div>
          </section>

          <section className="mt-9">
            <h1 className="flex items-center gap-3 text-xl font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground">◎</span>
              Seus dados
            </h1>
            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm font-medium text-muted-foreground">
                Nome completo
                <input
                  required
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="h-11 rounded-md border border-input bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                  placeholder="Preencha seu nome"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-muted-foreground">
                Email
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="h-11 rounded-md border border-input bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                  placeholder="Preencha seu email"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-muted-foreground">
                Confirme seu email
                <input
                  required
                  type="email"
                  value={form.confirmEmail}
                  onChange={(event) => updateField("confirmEmail", event.target.value)}
                  className="h-11 rounded-md border border-input bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                  placeholder="Confirme seu email"
                />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-muted-foreground">
                  CPF/CNPJ
                  <input
                    required
                    inputMode="numeric"
                    maxLength={14}
                    value={form.cpf}
                    onChange={(event) => updateField("cpf", event.target.value)}
                    className="h-11 rounded-md border border-input bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                    placeholder="Preencha seu CPF"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-muted-foreground">
                  Celular
                  <input
                    required
                    inputMode="tel"
                    maxLength={15}
                    value={form.phone}
                    onChange={(event) => updateField("phone", normalizePhone(event.target.value))}
                    className="h-11 rounded-md border border-input bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                    placeholder="11999999999"
                  />
                </label>
              </div>
              <p className="text-sm font-medium text-success">Porque pedimos esse dado?</p>
            </div>
          </section>

          <section className="mt-9">
            <h2 className="flex items-center gap-3 text-xl font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground">▣</span>
              Pagamento
            </h2>
            <div className="mt-5 rounded-3xl bg-emerald-900 p-7 text-center text-white shadow-sm">
              <p className="text-3xl font-extrabold">PIX</p>
              <p className="mt-3 text-sm text-emerald-100">Gere o QR code e copie o código PIX abaixo.</p>
            </div>
            <div className="mt-4 rounded-md border border-dashed border-emerald-300 bg-emerald-50 p-5">
              <p className="flex gap-3 text-sm"><span className="font-bold text-emerald-700">●</span>Liberação imediata</p>
              <p className="mt-3 flex gap-3 text-sm"><span className="font-bold text-emerald-700">●</span>É simples, só usar o aplicativo do seu banco para pagar Pix</p>
            </div>
          </section>

          <section className="mt-9">
            <h2 className="flex items-center gap-3 text-xl font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground">◇</span>
              Oferta limitada
            </h2>
            <label className={`mt-6 block cursor-pointer rounded-md border border-dashed signature-lift ${includeAddon ? "border-primary bg-secondary" : "border-border bg-muted"}`}>
              <div className="flex items-center justify-between border-b border-border px-5 py-3 text-lg font-extrabold">
                SIM, EU QUERO AJUDAR!
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{includeAddon ? "✓" : "+"}</span>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[80px_1fr_auto] sm:items-center">
                <img src={addonProduct.image} alt="Foto de Odair José" className="h-20 w-20 rounded-md object-cover" />
                <div>
                  <p className="font-extrabold text-foreground">{addonProduct.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{addonProduct.description}</p>
                </div>
                <p className="text-lg font-extrabold text-primary">{formatCurrency(addonProduct.price)}</p>
              </div>
              <div className="flex items-center gap-3 border-t border-border px-5 py-3 text-sm font-extrabold">
                <input
                  type="checkbox"
                  checked={includeAddon}
                  onChange={(event) => setIncludeAddon(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Adicionar Produto
              </div>
            </label>
          </section>

          {error && <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p>}

          {pixCode && (
            <section className="mt-6 rounded-md border border-primary/30 bg-secondary p-5">
              <h2 className="text-lg font-extrabold">PIX copia e cola gerado</h2>
              <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="rounded-2xl border border-input bg-card p-4 text-center shadow-sm">
                  <img src={qrCodeUrl} alt="QR Code PIX" className="mx-auto h-56 w-56 object-contain" />
                  <p className="mt-4 text-sm text-muted-foreground">Escaneie pelo app ou copie o código PIX.</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Use o código abaixo se preferir colar no seu banco:</p>
                  <textarea readOnly value={pixCode} className="mt-3 h-28 w-full resize-none rounded-md border border-input bg-card p-3 text-sm text-foreground" />
                  <button type="button" onClick={copyPix} className="mt-3 h-11 w-full rounded-md bg-primary px-4 font-extrabold text-primary-foreground transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring/35">
                    {copied ? "Código copiado" : "Copiar código PIX"}
                  </button>
                </div>
              </div>
            </section>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-6 h-12 w-full rounded-md bg-primary px-5 text-base font-extrabold text-primary-foreground transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "loading" ? "Gerando PIX..." : "Pagar com PIX"}
          </button>
        </form>

        <aside className="checkout-shadow sticky top-6 overflow-hidden rounded-lg border border-border bg-card">
          <div className="bg-panel px-6 py-4 text-center text-xl font-extrabold text-panel-foreground">Compra segura</div>
          <div className="p-6 space-y-4">
            <div className="flex gap-4">
              <img src={mainProduct.image} alt="Capa do livro digital" className="h-24 w-20 rounded-md object-cover" />
              <div>
                <p className="text-xl font-extrabold leading-tight">{mainProduct.title}</p>
                <p className="mt-3 text-sm text-muted-foreground">Precisa de ajuda?</p>
                <a href="mailto:odairjoseacc1@outlook.com" className="text-sm font-semibold text-primary underline underline-offset-2">Veja o contato do vendedor</a>
              </div>
            </div>
          </div>
          <div className="border-y border-dashed border-border p-6">
            <h2 className="text-xl font-extrabold">Resumo do pedido</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span>{mainProduct.title}</span><strong>{formatCurrency(mainProduct.price)}</strong></div>
              {includeAddon && <div className="flex justify-between gap-4"><span>Apoio ao livro físico</span><strong>{formatCurrency(addonProduct.price)}</strong></div>}
              <div className="flex justify-between gap-4 text-muted-foreground"><span>Taxa de serviço</span><strong>{formatCurrency(serviceFee)}</strong></div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-end justify-between gap-4">
              <p className="text-2xl font-extrabold">Total</p>
              <p className="text-xl font-extrabold text-primary">{formatCurrency(total)}</p>
            </div>
            <p className="mt-2 text-sm text-primary">à vista no PIX</p>
          </div>
          <div className="border-t border-border px-6 py-5 text-center text-xs leading-relaxed text-muted-foreground">
            <p className="text-xl font-extrabold text-primary">Pagamento seguro</p>
            <p className="mt-2">Transação processada com segurança para o vendedor Odair José.</p>
            <p className="mt-3">Compra protegida e dados criptografados.</p>
          </div>
          <div className="border-t border-border px-6 py-5 bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">Depoimentos</div>
            <div className="mt-4 grid gap-4">
              <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-center">
                  <img src="/Mariana Lopes.webp" alt="Mariana Lopes" className="h-20 w-20 rounded-full object-cover" />
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-900">“Eu chorei do começo ao fim. Não é só um livro sobre luto, é sobre amor vivido de verdade. Me senti abraçada por cada página.”</p>
                <p className="mt-4 text-center text-sm font-semibold text-slate-700">Mariana Lopes</p>
              </div>
              <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-center">
                  <img src="/Cláudia Ribeiro.webp" alt="Cláudia Ribeiro" className="h-20 w-20 rounded-full object-cover" />
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-900">“Esse livro me fez lembrar de alguém que eu perdi e de tudo o que ficou sem ser dito. É simples, sincero e muito humano.”</p>
                <p className="mt-4 text-center text-sm font-semibold text-slate-700">Cláudia Ribeiro</p>
              </div>
              <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-center">
                  <img src="/Juliana Freitas.webp" alt="Juliana Freitas" className="h-20 w-20 rounded-full object-cover" />
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-900">“É aquele tipo de livro que toca fundo, que faz a gente desacelerar e sentir cada página. Uma leitura sensível, verdadeira e impossível de esquecer.”</p>
                <p className="mt-4 text-center text-sm font-semibold text-slate-700">Juliana Freitas</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento PIX Gerado</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-2xl border border-input bg-card p-4 text-center shadow-sm">
              <img src={qrCodeUrl} alt="QR Code PIX" className="mx-auto h-56 w-56 object-contain" />
              <p className="mt-4 text-sm text-muted-foreground">Escaneie pelo app ou copie o código PIX.</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Use o código abaixo se preferir colar no seu banco:</p>
              <textarea readOnly value={pixCode} className="mt-3 h-28 w-full resize-none rounded-md border border-input bg-card p-3 text-sm text-foreground" />
              <button type="button" onClick={copyPix} className="mt-3 h-11 w-full rounded-md bg-primary px-4 font-extrabold text-primary-foreground transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring/35">
                {copied ? "Código copiado" : "Copiar código PIX"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notificações no canto inferior da tela */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {activeNotifications.map((notification) => (
          <div
            key={notification.id}
            className="animate-in slide-in-from-right-2 fade-in-0 duration-300 rounded-lg border border-green-200 bg-green-50 px-6 py-4 shadow-lg"
          >
            <p className="text-lg font-bold text-green-800">{notification.message}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
