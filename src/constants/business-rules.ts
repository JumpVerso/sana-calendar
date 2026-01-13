// Preços em centavos (ex: R$ 150,00 = 15000)
export const PRICE_TABLE = {
    online: {
        padrao: 15000,      // R$ 150,00
        promocional: 8000,  // R$ 80,00
        emergencial: 20000, // R$ 200,00
    },
    presential: {
        padrao: 20000,      // R$ 200,00
        promocional: 10000, // R$ 100,00
        emergencial: 25000, // R$ 250,00
    },
} as const;

export const PERSONAL_ACTIVITIES = [
    "Almoço",
    "Academia",
    "Terapia",
    "Lazer",
    "Estudos",
    "Outro",
];

export const COMMERCIAL_STATUSES = [
    "VAGO",
    "AGUARDANDO",
    "RESERVADO",
    "CONFIRMADO",
    "CONTRATADO",
    "INDISPONIVEL",
];

export const PRICE_CATEGORIES = [
    { value: "padrao", label: "Padrão" },
    { value: "promocional", label: "Promocional" },
    { value: "emergencial", label: "Emergencial" },
];

