"use client";

import { useEffect } from "react";

const translations: Record<string, string> = {
  "Nova conversa": "New conversation", "Sua conta": "Your account", "Métodos de pagamento": "Payment methods", "Compras": "Purchases", "Lojas conectadas": "Connected stores", "Trilha de auditoria": "Audit trail", "Identidade verificada": "Verified identity", "Verificando identidade…": "Verifying identity…", "Conta": "Account", "Limite": "Limit", "Disponível agora": "Available now", "Evidência": "Evidence", "Nenhuma conversa ainda": "No conversations yet", "Econômica": "Economy", "Selecionar oferta": "Select offer", "Preparar autorização": "Prepare authorization", "Autorizar Jaguary": "Authorize Jaguary", "Revogar mandato": "Revoke permission", "Confirmar revogação": "Confirm revocation", "Converse com o Jaguary…": "Chat with Jaguary…", "Oi, Marta. O que você quer comprar?": "Hi, Marta. What would you like to buy?", "Voltar para a busca": "Back to search", "Alterar busca": "Change search", "Voo não encontrado": "Flight not found", "Sua viagem começa aqui.": "Your journey starts here.", "Rota selecionada": "Selected route", "Partida": "Departure", "Duração": "Duration", "Itinerário": "Itinerary", "Total por passageiro": "Total per passenger", "Continuar com Jaguary": "Continue with Jaguary"
};

function translate(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => { const value = node.nodeValue ?? ""; const trimmed = value.trim(); if (translations[trimmed]) node.nodeValue = value.replace(trimmed, translations[trimmed]); });
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder], textarea[placeholder]").forEach((element) => { if (element.placeholder === "Converse com o Jaguary…") element.placeholder = "Chat with Jaguary…"; });
}

export function EnglishUi() {
  useEffect(() => { translate(document.body); const observer = new MutationObserver(() => translate(document.body)); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect(); }, []);
  return null;
}
