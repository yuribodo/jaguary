export const RAIL_STATIONS = [
  {
    id: "human",
    index: "01",
    label: "Human",
    verb: "Defines",
    copy: "Marta describes the purchase and signs the mandate. Authority starts with her, not the agent.",
    pending: false,
  },
  {
    id: "mandate",
    index: "02",
    label: "Mandate",
    verb: "Limits",
    copy: "Amount, merchant, validity, and scope stay explicit before any action.",
    pending: false,
  },
  {
    id: "agent",
    index: "03",
    label: "Agent",
    verb: "Acts",
    copy: "TravelBot only operates inside the active letter. Off the rail, there is no credential.",
    pending: false,
  },
  {
    id: "checkout",
    index: "04",
    label: "Checkout",
    verb: "Fixes",
    copy: "VuelaYa publishes merchant-authored terms. Jaguary does not invent the price.",
    pending: false,
  },
  {
    id: "payment",
    index: "05",
    label: "Payment",
    verb: "Waits",
    copy: "Yuno is called only after ALLOW. Revoke cuts the rail before money moves.",
    pending: true,
  },
] as const;

export type RailStation = (typeof RAIL_STATIONS)[number];
