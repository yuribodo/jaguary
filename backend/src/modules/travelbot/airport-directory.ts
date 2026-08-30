export interface GroundedAirport {
  iata: string;
  city: string;
  country: string;
  aliases: readonly string[];
}

export const groundedAirports = [
  { iata: "GRU", city: "São Paulo", country: "Brazil", aliases: ["São Paulo", "Sao Paulo", "Guarulhos", "Brasil", "Brazil"] },
  { iata: "GIG", city: "Rio de Janeiro", country: "Brazil", aliases: ["Rio de Janeiro", "Galeão", "Galeao", "Tom Jobim International Airport"] },
  { iata: "PVH", city: "Porto Velho", country: "Brazil", aliases: ["Porto Velho"] },
  { iata: "JPR", city: "Ji-Paraná", country: "Brazil", aliases: ["Ji-Paraná", "Ji Parana"] },
  { iata: "BVH", city: "Vilhena", country: "Brazil", aliases: ["Vilhena"] },
  { iata: "OAL", city: "Cacoal", country: "Brazil", aliases: ["Cacoal"] },
  { iata: "EZE", city: "Buenos Aires", country: "Argentina", aliases: ["Buenos Aires", "Argentina"] },
  { iata: "COR", city: "Córdoba", country: "Argentina", aliases: ["Córdoba", "Cordoba", "Pajas Blancas"] },
  { iata: "SCL", city: "Santiago", country: "Chile", aliases: ["Santiago", "Santiago do Chile", "Chile"] },
  { iata: "MVD", city: "Montevideo", country: "Uruguay", aliases: ["Montevideo", "Montevidéu", "Uruguay", "Uruguai"] },
  { iata: "ASU", city: "Asunción", country: "Paraguay", aliases: ["Asunción", "Asuncion", "Assunção", "Assuncao", "Paraguay", "Paraguai"] },
  { iata: "LIM", city: "Lima", country: "Peru", aliases: ["Lima", "Peru"] },
  { iata: "BOG", city: "Bogotá", country: "Colombia", aliases: ["Bogotá", "Bogota", "Colombia", "Colômbia"] },
  { iata: "UIO", city: "Quito", country: "Ecuador", aliases: ["Quito", "Ecuador", "Equador"] },
  { iata: "VVI", city: "Santa Cruz de la Sierra", country: "Bolivia", aliases: ["Santa Cruz de la Sierra", "Santa Cruz Bolivia", "Bolivia", "Bolívia"] },
  { iata: "MEX", city: "Mexico City", country: "Mexico", aliases: ["Mexico City", "Cidade do México", "Cidade do Mexico", "México", "Mexico"] },
  { iata: "JFK", city: "New York", country: "United States", aliases: ["New York", "Nova York", "United States", "Estados Unidos"] },
  { iata: "YYZ", city: "Toronto", country: "Canada", aliases: ["Toronto", "Canada", "Canadá"] },
  { iata: "SJO", city: "San José", country: "Costa Rica", aliases: ["San José Costa Rica", "San Jose Costa Rica", "Costa Rica"] },
  { iata: "PTY", city: "Panama City", country: "Panama", aliases: ["Panama City", "Cidade do Panamá", "Cidade do Panama", "Panamá", "Panama"] },
  { iata: "SDQ", city: "Santo Domingo", country: "Dominican Republic", aliases: ["Santo Domingo", "Dominican Republic", "República Dominicana", "Republica Dominicana"] },
  { iata: "HAV", city: "Havana", country: "Cuba", aliases: ["Havana", "Havana Cuba", "Cuba"] },
  { iata: "KIN", city: "Kingston", country: "Jamaica", aliases: ["Kingston Jamaica", "Jamaica"] },
  { iata: "NAS", city: "Nassau", country: "Bahamas", aliases: ["Nassau", "Bahamas"] },
  { iata: "LHR", city: "London", country: "United Kingdom", aliases: ["London", "Londres", "Londes", "Heathrow", "United Kingdom", "Reino Unido"] },
  { iata: "CDG", city: "Paris", country: "France", aliases: ["Paris", "Charles de Gaulle", "France", "França", "Franca"] },
  { iata: "LIS", city: "Lisbon", country: "Portugal", aliases: ["Lisbon", "Lisboa", "Portugal"] },
  { iata: "MAD", city: "Madrid", country: "Spain", aliases: ["Madrid", "Madri", "Spain", "Espanha"] },
  { iata: "FRA", city: "Frankfurt", country: "Germany", aliases: ["Frankfurt", "Germany", "Alemanha"] },
  { iata: "FCO", city: "Rome", country: "Italy", aliases: ["Rome", "Roma", "Fiumicino", "Italy", "Itália", "Italia"] },
  { iata: "AMS", city: "Amsterdam", country: "Netherlands", aliases: ["Amsterdam", "Amsterdã", "Amsterda", "Netherlands", "Holanda", "Países Baixos", "Paises Baixos"] },
  { iata: "BRU", city: "Brussels", country: "Belgium", aliases: ["Brussels", "Bruxelas", "Belgium", "Bélgica", "Belgica"] },
  { iata: "ZRH", city: "Zurich", country: "Switzerland", aliases: ["Zurich", "Zürich", "Zurique", "Switzerland", "Suíça", "Suica"] },
  { iata: "VIE", city: "Vienna", country: "Austria", aliases: ["Vienna", "Viena", "Austria", "Áustria"] },
  { iata: "DUB", city: "Dublin", country: "Ireland", aliases: ["Dublin", "Ireland", "Irlanda"] },
  { iata: "CPH", city: "Copenhagen", country: "Denmark", aliases: ["Copenhagen", "Copenhague", "Denmark", "Dinamarca"] },
  { iata: "OSL", city: "Oslo", country: "Norway", aliases: ["Oslo", "Norway", "Noruega"] },
  { iata: "ARN", city: "Stockholm", country: "Sweden", aliases: ["Stockholm", "Estocolmo", "Sweden", "Suécia", "Suecia"] },
  { iata: "HEL", city: "Helsinki", country: "Finland", aliases: ["Helsinki", "Helsinque", "Finland", "Finlândia", "Finlandia"] },
  { iata: "KEF", city: "Reykjavík", country: "Iceland", aliases: ["Reykjavík", "Reykjavik", "Keflavik", "Iceland", "Islândia", "Islandia"] },
  { iata: "ATH", city: "Athens", country: "Greece", aliases: ["Athens", "Atenas", "Greece", "Grécia", "Grecia"] },
  { iata: "WAW", city: "Warsaw", country: "Poland", aliases: ["Warsaw", "Varsóvia", "Varsovia", "Poland", "Polônia", "Polonia"] },
  { iata: "PRG", city: "Prague", country: "Czechia", aliases: ["Prague", "Praga", "Czechia", "Czech Republic", "República Tcheca", "Republica Tcheca"] },
  { iata: "BUD", city: "Budapest", country: "Hungary", aliases: ["Budapest", "Budapeste", "Hungary", "Hungria"] },
  { iata: "OTP", city: "Bucharest", country: "Romania", aliases: ["Bucharest", "Bucareste", "Romania", "Romênia", "Romenia"] },
  { iata: "ZAG", city: "Zagreb", country: "Croatia", aliases: ["Zagreb", "Croatia", "Croácia", "Croacia"] },
  { iata: "BEG", city: "Belgrade", country: "Serbia", aliases: ["Belgrade", "Belgrado", "Serbia", "Sérvia", "Servia"] },
  { iata: "IST", city: "Istanbul", country: "Turkey", aliases: ["Istanbul", "Istambul", "Turkey", "Türkiye", "Turquia"] },
  { iata: "CMN", city: "Casablanca", country: "Morocco", aliases: ["Casablanca", "Morocco", "Marrocos"] },
  { iata: "CAI", city: "Cairo", country: "Egypt", aliases: ["Cairo", "Egypt", "Egito"] },
  { iata: "JNB", city: "Johannesburg", country: "South Africa", aliases: ["Johannesburg", "Joanesburgo", "South Africa", "África do Sul", "Africa do Sul"] },
  { iata: "NBO", city: "Nairobi", country: "Kenya", aliases: ["Nairobi", "Nairóbi", "Kenya", "Quênia", "Quenia"] },
  { iata: "ADD", city: "Addis Ababa", country: "Ethiopia", aliases: ["Addis Ababa", "Adis Abeba", "Ethiopia", "Etiópia", "Etiopia"] },
  { iata: "ACC", city: "Accra", country: "Ghana", aliases: ["Accra", "Acra", "Ghana"] },
  { iata: "LOS", city: "Lagos", country: "Nigeria", aliases: ["Lagos", "Nigeria", "Nigéria"] },
  { iata: "DSS", city: "Dakar", country: "Senegal", aliases: ["Dakar", "Dacar", "Senegal"] },
  { iata: "DXB", city: "Dubai", country: "United Arab Emirates", aliases: ["Dubai", "United Arab Emirates", "Emirados Árabes Unidos", "Emirados Arabes Unidos"] },
  { iata: "DOH", city: "Doha", country: "Qatar", aliases: ["Doha", "Qatar", "Catar"] },
  { iata: "TLV", city: "Tel Aviv", country: "Israel", aliases: ["Tel Aviv", "Israel"] },
  { iata: "RUH", city: "Riyadh", country: "Saudi Arabia", aliases: ["Riyadh", "Riad", "Saudi Arabia", "Arábia Saudita", "Arabia Saudita"] },
  { iata: "AMM", city: "Amman", country: "Jordan", aliases: ["Amman", "Amã", "Ama", "Jordan", "Jordânia", "Jordania"] },
  { iata: "BKK", city: "Bangkok", country: "Thailand", aliases: ["Bangkok", "Thailand", "Tailândia", "Tailandia"] },
  { iata: "HND", city: "Tokyo", country: "Japan", aliases: ["Tokyo", "Tóquio", "Toquio", "Haneda", "Japan", "Japão", "Japao"] },
  { iata: "ICN", city: "Seoul", country: "South Korea", aliases: ["Seoul", "Seul", "Incheon", "South Korea", "Coreia do Sul"] },
  { iata: "PEK", city: "Beijing", country: "China", aliases: ["Beijing", "Pequim", "China"] },
  { iata: "SIN", city: "Singapore", country: "Singapore", aliases: ["Singapore", "Singapura"] },
  { iata: "DEL", city: "New Delhi", country: "India", aliases: ["New Delhi", "Nova Delhi", "Nova Délhi", "Nova Deli", "India", "Índia"] },
  { iata: "CGK", city: "Jakarta", country: "Indonesia", aliases: ["Jakarta", "Jacarta", "Indonesia", "Indonésia"] },
  { iata: "KUL", city: "Kuala Lumpur", country: "Malaysia", aliases: ["Kuala Lumpur", "Malaysia", "Malásia", "Malasia"] },
  { iata: "HAN", city: "Hanoi", country: "Vietnam", aliases: ["Hanoi", "Hanói", "Vietnam", "Vietnã", "Vietna"] },
  { iata: "MNL", city: "Manila", country: "Philippines", aliases: ["Manila", "Philippines", "Filipinas"] },
  { iata: "TPE", city: "Taipei", country: "Taiwan", aliases: ["Taipei", "Taiwan"] },
  { iata: "CMB", city: "Colombo", country: "Sri Lanka", aliases: ["Colombo", "Sri Lanka"] },
  { iata: "KTM", city: "Kathmandu", country: "Nepal", aliases: ["Kathmandu", "Catmandu", "Nepal"] },
  { iata: "DAC", city: "Dhaka", country: "Bangladesh", aliases: ["Dhaka", "Daca", "Bangladesh"] },
  { iata: "SYD", city: "Sydney", country: "Australia", aliases: ["Sydney", "Australia", "Austrália"] },
  { iata: "AKL", city: "Auckland", country: "New Zealand", aliases: ["Auckland", "New Zealand", "Nova Zelândia", "Nova Zelandia"] },
  { iata: "NAN", city: "Nadi", country: "Fiji", aliases: ["Nadi", "Fiji"] },
] as const satisfies readonly GroundedAirport[];

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapedAlias(alias: string): string {
  return normalizedText(alias)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

function aliasAppears(message: string, alias: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${escapedAlias(alias)}(?=$|[^a-z0-9])`).test(message);
}

function airportForRole(
  messages: readonly string[],
  role: "origin" | "destination",
): GroundedAirport | undefined {
  const prefix = role === "destination"
    ? "(?:to|towards?|para(?:\\s+(?:o|a))?|pra|pro|destination(?:\\s+(?:is|e)|:)?|destino(?:\\s+(?:e|:))?)"
    : "(?:from|leav(?:e|ing)\\s+from|depart(?:ing)?\\s+from|sa(?:io|indo)\\s+de|part(?:o|indo)\\s+de|origem(?:\\s+(?:e|:))?|de)";

  for (const rawMessage of messages.toReversed()) {
    const message = normalizedText(rawMessage).trim();
    const exactMessage = message.replace(/[.!?]+$/g, "").trim();
    const candidates = groundedAirports.flatMap((airport) => airport.aliases.map((alias) => ({ airport, alias })))
      .toSorted((left, right) => normalizedText(right.alias).length - normalizedText(left.alias).length);
    for (const candidate of candidates) {
      const normalizedAlias = normalizedText(candidate.alias);
      if (role === "destination" && exactMessage === normalizedAlias) return candidate.airport;
      const expression = new RegExp(
        `(?:^|\\b)${prefix}\\s+(?:the\\s+)?${escapedAlias(candidate.alias)}(?=$|[^a-z0-9])`,
      );
      if (expression.test(message)) return candidate.airport;
    }
  }
  return undefined;
}

export function originAirportFrom(messages: readonly string[]): GroundedAirport | undefined {
  return airportForRole(messages, "origin");
}

export function destinationAirportFrom(messages: readonly string[]): GroundedAirport | undefined {
  return airportForRole(messages, "destination");
}

export function relevantGroundedAirportAliases(
  messages: readonly string[],
): Array<{ aliases: readonly string[]; iata: string }> {
  const normalizedMessages = messages.map(normalizedText);
  return groundedAirports
    .filter((airport) => normalizedMessages.some((message) => (
      aliasAppears(message, airport.iata)
      || airport.aliases.some((alias) => aliasAppears(message, alias))
    )))
    .map(({ aliases, iata }) => ({ aliases, iata }));
}

export const groundedAirportCountryCount = new Set(groundedAirports.map(({ country }) => country)).size;
