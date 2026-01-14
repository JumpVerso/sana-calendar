import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mantém apenas dígitos em um input (útil para campos monetários)
export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

// Formata centavos para BRL (ex: 15000 => "R$ 150,00")
export function formatCentsToBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Formata centavos para string numérica (ex: 15000 => "150,00")
export function formatCentsToNumberString(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "";
  const numCents = Number(cents);
  if (isNaN(numCents)) return "";
  const reais = numCents / 100;
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Analisa input de moeda para centavos (ex: "150,00" => 15000, "15,00" => 1500)
// Remove formatação e retorna raw string de centavos
export function parseCurrencyInputToCents(currentValue: string): string {
  // Remove tudo que não é dígito
  const digits = currentValue.replace(/\D/g, "");
  // Retorna os dígitos crus, que representam os centavos
  // Ex: input "150,00" -> remove ',' -> "15000"
  // Ex: input "1,500.00" -> remove '.' and ',' -> "150000"
  // Se o usuário digita "1" -> "1". Render vai dividir por 100 -> 0,01.
  return digits;
}

// Converte input do usuário (em reais) para centavos
// Ex: "80" => 8000, "80,50" => 8050, "150,00" => 15000
export function parseReaisInputToCents(inputValue: string): number {
  if (!inputValue || !inputValue.trim()) return 0;
  
  // Normaliza: substitui vírgula por ponto e remove espaços
  const normalized = inputValue.trim().replace(",", ".").replace(/\s/g, "");
  
  // Converte para número (reais)
  const reais = parseFloat(normalized);
  
  if (isNaN(reais)) return 0;
  
  // Converte para centavos (multiplica por 100)
  return Math.round(reais * 100);
}