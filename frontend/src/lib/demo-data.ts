export type DemoWalletCard = { id: string; brand: "mastercard" | "visa"; lastFour: string; expiry: string; reference: string; limit: number; used: number; usage: string };

export const walletCards: DemoWalletCard[] = [
  { id: "mastercard-0446", brand: "mastercard", lastFour: "0446", expiry: "01/31", reference: "cred_demo_marta_mastercard", limit: 8000, used: 1860, usage: "Mandate-authorized purchases" },
  { id: "mastercard-5364", brand: "mastercard", lastFour: "5364", expiry: "05/29", reference: "cred_demo_marta_mastercard_2", limit: 5000, used: 920, usage: "Mandate-authorized purchases" },
  { id: "visa-1855", brand: "visa", lastFour: "1855", expiry: "12/30", reference: "cred_demo_marta_visa", limit: 6500, used: 0, usage: "Mandate-authorized purchases" },
];

export const demoPurchases = [
  { route: "São Paulo → Rio", amount: 600, date: "Aug 18, 2026", card: "•••• 0446", receipt: "vy_7B91K" },
  { route: "Mexico City → Bogotá", amount: 2300, date: "Aug 12, 2026", card: "•••• 5364", receipt: "vy_42MQA" },
  { route: "São Paulo → Buenos Aires", amount: 1600, date: "Aug 03, 2026", card: "•••• 1855", receipt: "vy_9P3LD" },
  { route: "Buenos Aires → Mexico City", amount: 3700, date: "Jul 27, 2026", card: "•••• 0446", receipt: "vy_1H8RX" },
];

export const connectedStoreCount = 2;
