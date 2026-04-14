import type { ListenMode, PageType } from "@/lib/types";

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.g\./gi, "for example"],
  [/\bi\.e\./gi, "that is"],
  [/\betc\./gi, "etcetera"],
  [/\bvs\./gi, "versus"],
];

const ORDINALS = new Map<number, string>([
  [1, "first"],
  [2, "second"],
  [3, "third"],
  [4, "fourth"],
  [5, "fifth"],
  [6, "sixth"],
  [7, "seventh"],
  [8, "eighth"],
  [9, "ninth"],
  [10, "tenth"],
  [11, "eleventh"],
  [12, "twelfth"],
  [13, "thirteenth"],
  [14, "fourteenth"],
  [15, "fifteenth"],
  [16, "sixteenth"],
  [17, "seventeenth"],
  [18, "eighteenth"],
  [19, "nineteenth"],
  [20, "twentieth"],
  [21, "twenty-first"],
  [22, "twenty-second"],
  [23, "twenty-third"],
  [24, "twenty-fourth"],
  [25, "twenty-fifth"],
  [26, "twenty-sixth"],
  [27, "twenty-seventh"],
  [28, "twenty-eighth"],
  [29, "twenty-ninth"],
  [30, "thirtieth"],
  [31, "thirty-first"],
]);

const MONTHS = new Map<string, string>([
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["may", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["sept", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
]);

function protectSegments(text: string, pattern: RegExp, bank: string[]): string {
  return text.replace(pattern, (segment) => {
    const token = `__PROTECTED_${bank.length}__`;
    bank.push(segment);
    return token;
  });
}

function restoreSegments(text: string, bank: string[]): string {
  return bank.reduce(
    (current, value, index) => current.replaceAll(`__PROTECTED_${index}__`, value),
    text,
  );
}

function normalizeCurrency(text: string): string {
  return text.replace(
    /([\u0024\u00a3\u20ac])(\d[\d,]*)(?:\.(\d{1,2}))?([kmbKMB])?/g,
    (_match, currency: string, whole: string, cents?: string, suffix?: string) => {
      const normalizedWhole = whole.replaceAll(",", "");
      const suffixWord =
        suffix?.toLowerCase() === "k"
          ? " thousand"
          : suffix?.toLowerCase() === "m"
            ? " million"
            : suffix?.toLowerCase() === "b"
              ? " billion"
              : "";

      const unit =
        currency === "$" ? "dollars" : currency === "\u00a3" ? "pounds" : "euros";

      if (suffixWord) {
        return `${normalizedWhole}${cents ? `.${cents}` : ""}${suffixWord} ${unit}`;
      }

      if (!cents || cents === "00") {
        return `${normalizedWhole} ${unit}`;
      }

      const minorUnit =
        currency === "$" ? "cents" : currency === "\u00a3" ? "pence" : "cents";

      return `${normalizedWhole} ${unit} and ${cents} ${minorUnit}`;
    },
  );
}

function normalizeDates(text: string): string {
  return text.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2})(st|nd|rd|th)?(?:,)? (\d{4})\b/gi,
    (_match, month: string, day: string, _suffix: string | undefined, year: string) => {
      const monthName = MONTHS.get(month.toLowerCase()) ?? month;
      const dayValue = Number(day);
      const dayWord = ORDINALS.get(dayValue) ?? day;
      return `${monthName} ${dayWord}, ${year}`;
    },
  );
}

function normalizeOrdinals(text: string): string {
  return text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, (_match, value: string) => {
    const word = ORDINALS.get(Number(value));
    return word ?? value;
  });
}

export function normalizeForSpeech(
  text: string,
  options?: {
    pageType?: PageType;
    mode?: ListenMode;
  },
): string {
  const protectedSegments: string[] = [];
  let output = text;

  output = protectSegments(output, /https?:\/\/\S+/g, protectedSegments);
  output = protectSegments(output, /`[^`]+`/g, protectedSegments);

  ABBREVIATIONS.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });

  output = normalizeCurrency(output);
  output = output.replace(/\b(Published|Updated)(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/g, "$1 $2");
  output = normalizeDates(output);
  output = normalizeOrdinals(output);
  output = output.replace(/(\d+(?:\.\d+)?)%/g, "$1 percent");
  output = output.replace(/\s&\s/g, " and ");
  output = output.replace(/\s\+\s/g, " plus ");

  if (options?.pageType === "docs") {
    output = output.replace(/\s=>\s/g, " returns ");
    output = output.replace(/\s->\s/g, " maps to ");
  }

  output = output
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return restoreSegments(output, protectedSegments);
}
