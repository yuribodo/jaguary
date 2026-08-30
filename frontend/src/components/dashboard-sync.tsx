"use client";

import { useEffect } from "react";
import { connectedStoreCount, demoPurchases, walletCards } from "@/lib/demo-data";
import { DashboardPage } from "@/components/dashboard-page";

const brl = new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" });

export function SyncedDashboardPage() {
  useEffect(() => {
    const spent = demoPurchases.reduce((total, purchase) => total + purchase.amount, 0);
    const totalLimit = walletCards.reduce((total, card) => total + card.limit, 0);
    const used = walletCards.reduce((total, card) => total + card.used, 0);
    const metricValues = document.querySelectorAll<HTMLElement>("main .text-3xl");
    if (metricValues[0]) metricValues[0].textContent = String(demoPurchases.length);
    if (metricValues[1]) metricValues[1].textContent = String(walletCards.length);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.nodeValue?.includes("R$8,200.00 in history")) node.nodeValue = `R$${spent.toLocaleString("en-US", { minimumFractionDigits: 2 })} in history`;
      if (node.nodeValue?.includes("Across 2 agents")) node.nodeValue = `Across ${connectedStoreCount} agents`;
      if (node.nodeValue?.includes("R$16,720.00")) node.nodeValue = brl.format(totalLimit - used);
      if (node.nodeValue?.includes("of R$19,500.00 available")) node.nodeValue = `of ${brl.format(totalLimit)} available`;
    }
  }, []);
  return <DashboardPage />;
}
