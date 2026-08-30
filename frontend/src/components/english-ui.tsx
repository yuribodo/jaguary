"use client";

import { useEffect } from "react";

const translations: Record<string, string> = {
  "Nova conversa": "New conversation", "Sua conta": "Your account", "M\u00e9todos de pagamento": "Payment methods", "Compras": "Purchases", "Lojas conectadas": "Connected stores", "Trilha de auditoria": "Audit trail", "Identidade verificada": "Verified identity", "Conta": "Account", "Limite": "Limit", "Dispon\u00edvel agora": "Available now", "Evid\u00eancia": "Evidence", "Nenhuma conversa ainda": "No conversations yet", "Econ\u00f4mica": "Economy", "Selecionar oferta": "Select offer", "Preparar autoriza\u00e7\u00e3o": "Prepare authorization", "Autorizar Jaguary": "Authorize Jaguary", "Revogar mandato": "Revoke permission", "Confirmar revoga\u00e7\u00e3o": "Confirm revocation", "Converse com o Jaguary…": "Chat with Jaguary…", "Oi, Marta. O que voc\u00ea quer comprar?": "Hi, Marta. What would you like to buy?",
  "Confirma\u00e7\u00e3o necess\u00e1ria": "Confirmation required", "Autoriza\u00e7\u00e3o ativa": "Permission active", "Autoriza\u00e7\u00e3o revogada": "Permission revoked", "Autoriza\u00e7\u00e3o expirada": "Permission expired", "Autoriza\u00e7\u00e3o utilizada": "Permission used", "Preparando autoriza\u00e7\u00e3o": "Preparing permission", "Aguardando confirma\u00e7\u00e3o": "Awaiting confirmation", "Ainda n\u00e3o criada": "Not created yet", "Encontrar op\u00e7\u00e3o": "Find an option", "Precisa da sua confirma\u00e7\u00e3o": "Needs your confirmation", "Ainda n\u00e3o conectado": "Not connected yet", "Detalhes da opera\u00e7\u00e3o": "Operation details", "Saldo restante": "Remaining balance", "Restar\u00e1 se aprovado": "Remaining if approved", "Chave p\u00fablica observada na API": "Public key observed by the API", "A identidade ainda n\u00e3o p\u00f4de ser carregada.": "The identity could not be loaded yet.", "Nova opera\u00e7\u00e3o": "New operation", "Ainda n\u00e3o dispon\u00edvel": "Not available yet", "N\u00e3o foi poss\u00edvel conectar ao Bound": "Could not connect to JaguaryAI", "Dispon\u00edvel at\u00e9": "Available until", "Evid\u00eancias e detalhes t\u00e9cnicos": "Evidence and technical details", "Credencial l\u00f3gica": "Logical credential", "Autoriza\u00e7\u00e3o": "Permission", "Limite dispon\u00edvel": "Available limit", "Restar\u00e1 ap\u00f3s a compra": "Remaining after purchase", "Preparando…": "Preparing…", "Revogando…": "Revoking…", "Nenhuma decis\u00e3o solicitada": "No decision requested",
  "Voltar para a busca": "Back to search", "Alterar busca": "Change search", "Voo n\u00e3o encontrado": "Flight not found", "Sua viagem come\u00e7a aqui.": "Your journey starts here.", "Rota selecionada": "Selected route", "Partida": "Departure", "Dura\u00e7\u00e3o": "Duration", "Itiner\u00e1rio": "Itinerary", "Total por passageiro": "Total per passenger", "Continuar com Jaguary": "Continue with Jaguary", "Direto": "Nonstop", "1 escala": "1 stop",
  "Econ\u00f4mica premium": "Premium economy", "Quero viajar de S\u00e3o Paulo para C\u00f3rdoba, econ\u00f4mica, at\u00e9 US$ 150.": "I want to travel from São Paulo to Córdoba, economy, up to US$150.", "\u00daltimo correlation ID": "Latest correlation ID", "O checkout fixa os termos comerciais; ele n\u00e3o \u00e9 uma decis\u00e3o de autoriza\u00e7\u00e3o.": "Checkout records commercial terms; it is not an authorization decision.", "Compra ainda n\u00e3o dispon\u00edvel": "Purchase not available yet", "Falta conectar verifica\u00e7\u00e3o e pagamento.": "Verification and payment still need to be connected.", "Limitada a estes termos e revog\u00e1vel a qualquer momento.": "Limited to these terms and revocable at any time.", "Revogar encerra este mandato, n\u00e3o a identidade do agente.": "Revoking ends this permission, not the agent identity.", "Esta a\u00e7\u00e3o encerra o mandato de forma definitiva.": "This action permanently ends the permission.", "Ativar o mandato n\u00e3o solicita nem presume uma decis\u00e3o de compra.": "Activating a permission does not request or assume a purchase decision.", "Encontrei uma op\u00e7\u00e3o direta da VuelaYa dentro do limite. Confira os dados antes de selecionar.": "I found a direct VuelaYa option within the limit. Review the details before selecting it.", "A consulta terminou, mas a VuelaYa n\u00e3o publicou uma oferta GRU → COR agora.": "The search finished, but VuelaYa has not published a GRU → COR offer right now.",
  "Trilha indispon\u00edvel": "Audit trail unavailable", "Conversa, recibo ou correlation ID": "Conversation, receipt, or correlation ID", "UUID da conversa, receipt_… ou corr_…": "Conversation UUID, receipt_…, or corr_…", "Consultando…": "Loading…", "Consultar trilha": "View audit trail", "CADEIA \u00cdNTEGRA": "CHAIN VERIFIED", "Hash do payload": "Payload hash", "Hash anterior": "Previous hash", "In\u00edcio da cadeia": "Start of chain", "Hash do evento": "Event hash", "Payload sanitizado": "Sanitized payload",
};

function translate(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    const value = node.nodeValue ?? "";
    const trimmed = value.trim();
    if (translations[trimmed]) node.nodeValue = value.replace(trimmed, translations[trimmed]);
  });
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder], textarea[placeholder]").forEach((element) => {
    if (translations[element.placeholder]) element.placeholder = translations[element.placeholder];
  });
}

export function EnglishUi() {
  useEffect(() => {
    translate(document.body);
    const observer = new MutationObserver(() => translate(document.body));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
