export type UnitMode = "auto" | "imperial" | "metric";

type ParsedQuantity = {
  amount: number;
  unit: string | null;
  unitToken: string | null;
  rest: string;
};

const UNIT_ALIASES: Record<string, string> = {
  teaspoons: "tsp",
  teaspoon: "tsp",
  tsp: "tsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  cup: "cup",
  cups: "cup",
  ounces: "oz",
  ounce: "oz",
  oz: "oz",
  pounds: "lb",
  pound: "lb",
  lb: "lb",
  pt: "pt",
  pint: "pt",
  pints: "pt",
  qt: "qt",
  quart: "qt",
  quarts: "qt",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
};

const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  "fl oz": 29.5735,
  pt: 473.176,
  qt: 946.353,
  gal: 3785.41,
};

const WEIGHT_TO_G: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
  g: 1,
  kg: 1000,
};

const LIQUID_KEYWORDS = [
  "water",
  "milk",
  "cream",
  "broth",
  "stock",
  "juice",
  "vinegar",
  "soy sauce",
  "fish sauce",
  "oil",
  "olive oil",
  "sesame oil",
  "buttermilk",
  "wine",
  "beer",
  "coconut milk",
  "honey",
  "syrup",
];

const SOLID_KEYWORDS = [
  "flour",
  "rice",
  "sugar",
  "salt",
  "butter",
  "cheese",
  "onion",
  "garlic",
  "pepper",
  "tomato",
  "potato",
  "carrot",
  "chicken",
  "beef",
  "pork",
  "tofu",
  "mushroom",
  "peas",
  "beans",
  "lentils",
  "pasta",
  "breadcrumbs",
];

export function scaleIngredient(text: string, scale: number, unitMode: UnitMode) {
  const parsed = parseQuantity(text);
  if (!parsed) return text;

  const scaledAmount = parsed.amount * scale;
  if (!parsed.unit) {
    const token = parsed.unitToken ? `${parsed.unitToken} ` : "";
    return `${formatAmount(scaledAmount)} ${token}${parsed.rest}`.trim();
  }

  const unitKey = normalizeUnit(parsed.unit);
  if (!unitKey) {
    const unitText = parsed.unitToken ?? parsed.unit;
    return `${formatAmount(scaledAmount)} ${unitText} ${parsed.rest}`.trim();
  }
  if (unitMode === "metric") {
    const metric = convertToMetric(scaledAmount, unitKey, parsed.rest);
    if (metric) {
      return `${formatAmount(metric.amount)} ${metric.unit} ${parsed.rest}`.trim();
    }
  }

  if (unitMode === "imperial") {
    const imperial = convertToImperial(scaledAmount, unitKey, parsed.rest);
    if (imperial) {
      return `${formatAmount(imperial.amount)} ${imperial.unit} ${parsed.rest}`.trim();
    }
  }

  if (unitMode === "auto") {
    if (isMetricUnit(unitKey)) {
      const imperial = convertToImperial(scaledAmount, unitKey, parsed.rest);
      if (imperial) {
        return `${formatAmount(imperial.amount)} ${imperial.unit} ${parsed.rest}`.trim();
      }
    } else {
      const metric = convertToMetric(scaledAmount, unitKey, parsed.rest);
      if (metric) {
        return `${formatAmount(metric.amount)} ${metric.unit} ${parsed.rest}`.trim();
      }
    }
  }

  const unitText = parsed.unitToken ?? parsed.unit;
  return `${formatAmount(scaledAmount)} ${unitText} ${parsed.rest}`.trim();
}

function parseQuantity(text: string): ParsedQuantity | null {
  const match = text.trim().match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)([a-zA-Z]+)?(.*)$/
  );
  if (!match) return null;
  const amount = parseAmount(match[1]);
  const inlineUnit = match[2] || null;
  const restRaw = (match[3] || "").trim();

  if (inlineUnit) {
    const normalized = normalizeUnit(inlineUnit);
    return {
      amount,
      unit: normalized,
      unitToken: inlineUnit,
      rest: restRaw,
    };
  }

  if (!restRaw) return { amount, unit: null, unitToken: null, rest: "" };

  const { unit, unitToken, rest } = parseUnit(restRaw);
  return { amount, unit, unitToken, rest };
}

function parseAmount(raw: string) {
  const cleaned = raw.trim();
  if (cleaned.includes(" ")) {
    const [whole, frac] = cleaned.split(/\s+/);
    return parseFloat(whole) + parseFraction(frac);
  }
  if (cleaned.includes("/")) return parseFraction(cleaned);
  return parseFloat(cleaned);
}

function parseFraction(raw: string) {
  const [num, den] = raw.split("/").map((n) => parseFloat(n));
  if (!den) return 0;
  return num / den;
}

function parseUnit(rest: string) {
  const lower = rest.toLowerCase();
  const tokens = lower.split(/\s+/);
  if (tokens.length >= 2) {
    const maybeTwo = `${tokens[0]} ${tokens[1]}`;
    if (maybeTwo === "fl oz" || maybeTwo === "fluid ounce" || maybeTwo === "fluid ounces") {
      const originalToken = rest.split(/\s+/).slice(0, 2).join(" ");
      return { unit: "fl oz", unitToken: originalToken, rest: rest.split(/\s+/).slice(2).join(" ") };
    }
  }

  const unitToken = rest.split(/\s+/)[0];
  const unitKey = normalizeUnit(unitToken);
  if (!unitKey) {
    return { unit: null, unitToken: null, rest };
  }
  const remaining = rest.split(/\s+/).slice(1).join(" ");
  return { unit: unitKey, unitToken, rest: remaining };
}

function normalizeUnit(unit: string) {
  const cleaned = unit.toLowerCase().replace(/[.,]/g, "");
  return UNIT_ALIASES[cleaned] ?? null;
}

function convertToMetric(amount: number, unit: string, rest: string) {
  if (unit === "ml" || unit === "l") {
    const ml = unit === "l" ? amount * 1000 : amount;
    return normalizeMetric(ml, "ml");
  }
  if (unit === "g" || unit === "kg") {
    const g = unit === "kg" ? amount * 1000 : amount;
    return normalizeMetric(g, "g");
  }
  if (VOLUME_TO_ML[unit]) {
    const target = detectIngredientState(rest);
    if (target === "solid") {
      return normalizeMetric(amount * VOLUME_TO_ML[unit], "g");
    }
    return normalizeMetric(amount * VOLUME_TO_ML[unit], "ml");
  }
  if (WEIGHT_TO_G[unit]) {
    return normalizeMetric(amount * WEIGHT_TO_G[unit], "g");
  }
  return null;
}

function convertToImperial(amount: number, unit: string, rest: string) {
  if (unit === "g") {
    return normalizeImperial(amount / WEIGHT_TO_G.oz, "oz");
  }
  if (unit === "kg") {
    return normalizeImperial((amount * 1000) / WEIGHT_TO_G.oz, "oz");
  }
  if (unit === "ml") {
    return normalizeImperial(amount / VOLUME_TO_ML["fl oz"], "fl oz", rest);
  }
  if (unit === "l") {
    return normalizeImperial((amount * 1000) / VOLUME_TO_ML["fl oz"], "fl oz", rest);
  }
  if (WEIGHT_TO_G[unit]) {
    return normalizeImperial(amount, unit);
  }
  if (VOLUME_TO_ML[unit]) {
    return normalizeImperial(amount, unit, rest);
  }
  return null;
}

function normalizeImperial(amount: number, unit: string, rest?: string) {
  if (unit === "oz") {
    if (amount >= 16) return { amount: amount / 16, unit: "lb" };
    return { amount, unit: "oz" };
  }
  if (unit === "fl oz") {
    const target = rest ? detectIngredientState(rest) : "liquid";
    if (target === "solid") return { amount, unit: "oz" };
    if (amount >= 32) return { amount: amount / 32, unit: "qt" };
    if (amount >= 16) return { amount: amount / 16, unit: "pt" };
    if (amount >= 8) return { amount: amount / 8, unit: "cup" };
    return { amount, unit: "fl oz" };
  }
  return { amount, unit };
}

function isMetricUnit(unit: string) {
  return unit === "g" || unit === "kg" || unit === "ml" || unit === "l";
}

function normalizeMetric(amount: number, unit: "ml" | "g") {
  if (unit === "ml" && amount >= 1000) {
    return { amount: amount / 1000, unit: "l" };
  }
  if (unit === "g" && amount >= 1000) {
    return { amount: amount / 1000, unit: "kg" };
  }
  return { amount, unit };
}

export function formatAmount(amount: number) {
  const rounded =
    amount >= 10 ? Math.round(amount * 10) / 10 : Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toString();
}

function detectIngredientState(rest: string) {
  const text = rest.toLowerCase();
  for (const keyword of LIQUID_KEYWORDS) {
    if (text.includes(keyword)) return "liquid";
  }
  for (const keyword of SOLID_KEYWORDS) {
    if (text.includes(keyword)) return "solid";
  }
  return "liquid";
}
