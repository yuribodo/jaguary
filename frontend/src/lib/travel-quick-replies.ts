import type { RequiredTravelIntentField, TravelIntent } from "@/lib/contracts";

export type TravelQuickReply = {
  description: string;
  label: string;
  value: string;
};

export type TravelQuickReplyGroup = {
  field: RequiredTravelIntentField;
  inputPlaceholder: string;
  options: TravelQuickReply[];
  question: string;
};

function upcomingMonths(now: Date): TravelQuickReply[] {
  return [1, 2, 3].map((offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
    const year = date.getFullYear();

    return {
      description: String(year),
      label: month,
      value: `I want to travel in ${month} ${year}.`,
    };
  });
}

const originOptions: TravelQuickReply[] = [
  { description: "GRU", label: "São Paulo", value: "I want to leave from São Paulo (GRU)." },
  { description: "GIG", label: "Rio de Janeiro", value: "I want to leave from Rio de Janeiro (GIG)." },
  { description: "BSB", label: "Brasília", value: "I want to leave from Brasília (BSB)." },
  { description: "CNF", label: "Belo Horizonte", value: "I want to leave from Belo Horizonte (CNF)." },
];

const destinationOptions: TravelQuickReply[] = [
  { description: "GIG", label: "Rio de Janeiro", value: "I want to go to Rio de Janeiro (GIG)." },
  { description: "GRU", label: "São Paulo", value: "I want to go to São Paulo (GRU)." },
  { description: "COR", label: "Córdoba", value: "I want to go to Córdoba (COR)." },
  { description: "BSB", label: "Brasília", value: "I want to go to Brasília (BSB)." },
  { description: "BKK", label: "Bangkok", value: "I want to go to Bangkok (BKK)." },
];

const quickRepliesByField: Omit<Record<RequiredTravelIntentField, TravelQuickReplyGroup>, "departure_date"> = {
  origin_iata: {
    field: "origin_iata",
    inputPlaceholder: "Type your departure city or airport…",
    question: "Where are you leaving from?",
    options: originOptions,
  },
  destination_iata: {
    field: "destination_iata",
    inputPlaceholder: "Type your destination city or airport…",
    question: "Where would you like to go?",
    options: destinationOptions,
  },
  passenger_count: {
    field: "passenger_count",
    inputPlaceholder: "Type how many people are traveling…",
    question: "How many people are traveling?",
    options: [
      { description: "Just me", label: "1 passenger", value: "There will be 1 passenger." },
      { description: "Two people", label: "2 passengers", value: "There will be 2 passengers." },
      { description: "Small group", label: "4 passengers", value: "There will be 4 passengers." },
    ],
  },
  cabin: {
    field: "cabin",
    inputPlaceholder: "Type your preferred cabin…",
    question: "Which cabin do you prefer?",
    options: [
      { description: "Best value", label: "Economy", value: "I prefer economy class." },
      { description: "More space", label: "Premium economy", value: "I prefer premium economy." },
      { description: "Full service", label: "Business", value: "I prefer business class." },
    ],
  },
  max_total_budget: {
    field: "max_total_budget",
    inputPlaceholder: "Type your total budget and currency…",
    question: "What is your total budget?",
    options: [
      { description: "Total trip", label: "R$ 1,000", value: "My total budget is up to BRL 1,000." },
      { description: "Total trip", label: "R$ 1,500", value: "My total budget is up to BRL 1,500." },
      { description: "Total trip", label: "R$ 2,500", value: "My total budget is up to BRL 2,500." },
    ],
  },
};

export function travelQuickReplyGroup(
  missingFields: readonly RequiredTravelIntentField[],
  now = new Date(),
  intent?: Pick<TravelIntent, "origin_iata" | "destination_iata">,
): TravelQuickReplyGroup | undefined {
  const field = missingFields[0];
  if (field === undefined) return undefined;

  if (field === "departure_date") {
    return {
      field,
      inputPlaceholder: "Type a date or month…",
      options: upcomingMonths(now),
      question: "When would you like to travel?",
    };
  }

  const group = quickRepliesByField[field];
  if (field === "origin_iata" && intent?.destination_iata !== null && intent?.destination_iata !== undefined) {
    return { ...group, options: group.options.filter(({ description }) => description !== intent.destination_iata).slice(0, 3) };
  }
  if (field === "destination_iata" && intent?.origin_iata !== null && intent?.origin_iata !== undefined) {
    return { ...group, options: group.options.filter(({ description }) => description !== intent.origin_iata).slice(0, 3) };
  }
  return { ...group, options: group.options.slice(0, 3) };
}
