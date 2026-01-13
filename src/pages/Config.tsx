import { useSettings, Modality, PriceCategory } from "@/hooks/useSettings";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { onlyDigits, formatCentsToBRL } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2, Pencil, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const modalities: { value: Modality; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "presential", label: "Presencial" },
];

const categories: { value: PriceCategory; label: string }[] = [
  { value: "padrao", label: "Padrão" },
  { value: "promocional", label: "Promocional" },
  { value: "emergencial", label: "Emergencial" },
];

const Config = () => {
  const { priceConfig, activities, appConfig, loading, updatePriceConfig, addActivity, toggleActivity, updateActivity, deleteActivity, updateAppConfig } =
    useSettings();
  const [activityInput, setActivityInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handlePriceChange = (modality: Modality, category: PriceCategory, rawValue: string) => {
    // rawValue vem em centavos dos utils (onlyDigits)
    const cents = parseInt(rawValue) || 0;
    const existing = priceConfig.find(p => p.modality === modality && p.category === category);
    let newList = [...priceConfig];
    if (existing) {
      newList = newList.map(p =>
        p.id === existing.id ? { ...p, value: cents } : p,
      );
    } else {
      newList.push({
        id: crypto.randomUUID(),
        modality,
        category,
        value: cents,
      });
    }
    updatePriceConfig(newList);
  };

  const handleToggleEmergencialPresential = (checked: boolean) => {
    // Regra: se "PADRÃO: Horário Emergencial É Somente ONLINE!" estiver ativa,
    // então only_online_emergencial = true (não permite emergencial presencial).
    // Switch invertido: checked = permitir emergencial presencial.
    updateAppConfig({ only_online_emergencial: !checked });
  };

  const onlyOnlineEmergencial = appConfig?.only_online_emergencial ?? true;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Configurações da Agenda</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Ajuste valores, atividades pessoais e regras de emergencial.
            </p>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm" className="flex items-center gap-1 whitespace-nowrap">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Voltar para calendário</span>
              <span className="sm:hidden text-xs">Calendário</span>
            </Button>
          </Link>
        </div>

        {/* Bloco de Visualização da Agenda */}
        <Card>
          <CardHeader>
            <CardTitle>Visualização da Agenda</CardTitle>
            <CardDescription>
              Defina o intervalo de horas exibido no calendário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Início</label>
                  <Select
                    value={appConfig?.startHour?.toString() || "6"}
                    onValueChange={(val) => {
                      const newStart = parseInt(val);
                      const currentEnd = appConfig?.endHour || 22;
                      // Ensure start < end
                      if (newStart >= currentEnd) {
                        updateAppConfig({ startHour: newStart, endHour: newStart + 1 });
                      } else {
                        updateAppConfig({ startHour: newStart });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Início" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }).map((_, i) => (
                        <SelectItem key={i} value={i.toString()} disabled={i >= 23}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fim</label>
                  <Select
                    value={appConfig?.endHour?.toString() || "22"}
                    onValueChange={(val) => updateAppConfig({ endHour: parseInt(val) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Fim" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 25 }).map((_, i) => {
                        const startHour = appConfig?.startHour || 6;
                        // End hour must be greater than start hour
                        const disabled = i <= startHour;
                        return (
                          <SelectItem key={i} value={i.toString()} disabled={disabled}>
                            {i.toString().padStart(2, '0')}:00
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco de preços */}
        <Card>
          <CardHeader>
            <CardTitle>Valores Padrão</CardTitle>
            <CardDescription>
              Configure os valores padrão, promocional e emergencial para cada modalidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading
                ? // Skeleton para blocos de preço
                [0, 1].map((i) => (
                  <div key={i} className="space-y-2 border rounded-lg p-3 bg-muted/40">
                    <Skeleton className="h-4 w-24" />
                    <div className="space-y-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="flex items-center gap-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-8 flex-1 rounded-md" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
                : modalities.map((m) => (
                  <div key={m.value} className="space-y-2 border rounded-lg p-3 bg-muted/40">
                    <h3 className="font-semibold text-sm">{m.label}</h3>
                    <div className="space-y-2">
                      {categories.map((c) => {
                        // Se regra "emergencial só online" estiver ativa, esconder emergencial de Presencial.
                        if (m.value === "presential" && c.value === "emergencial" && onlyOnlineEmergencial) {
                          return null;
                        }
                        const existing = priceConfig.find(
                          (p) => p.modality === m.value && p.category === c.value,
                        );
                        return (
                          <div key={c.value} className="flex items-center gap-2">
                            <span className="w-28 text-xs text-muted-foreground">{c.label}</span>
                            <div className="flex-1 flex items-center gap-1">
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                  R$
                                </span>
                                <Input
                                  className="h-8 text-xs pl-7"
                                  placeholder="0,00"
                                  defaultValue={existing?.value ? formatCentsToBRL(existing.value) : ""}
                                  inputMode="numeric"
                                  onBlur={(e) => {
                                    const cents = onlyDigits(e.target.value);
                                    handlePriceChange(m.value, c.value, cents);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              As alterações são salvas ao sair do campo de valor.
            </p>
          </CardFooter>
        </Card>

        {/* Bloco de atividades pessoais */}
        <Card>
          <CardHeader>
            <CardTitle>Atividades Pessoais</CardTitle>
            <CardDescription>
              Gerencie a lista de atividades pessoais. Limite de 20 caracteres por atividade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova atividade (ex: Almoço)"
                    value={activityInput}
                    maxLength={20}
                    onChange={(e) => setActivityInput(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (activityInput.trim()) {
                        addActivity(activityInput);
                        setActivityInput("");
                      }
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-2">

                  {activities.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((a, index, arr) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    >
                      {editingId === a.id ? (
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            maxLength={20}
                            className="h-7 text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              if (editLabel.trim()) {
                                updateActivity(a.id, { label: editLabel });
                                setEditingId(null);
                              }
                            }}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="truncate max-w-[150px] font-medium">{a.label}</span>
                      )}

                      <div className="flex items-center gap-1">
                        {!editingId && (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 p-0"
                                disabled={index === 0}
                                onClick={() => {
                                  const prev = arr[index - 1];
                                  if (prev) {
                                    updateActivity(a.id, { sort_order: prev.sort_order || index - 1 });
                                    updateActivity(prev.id, { sort_order: a.sort_order || index });
                                  }
                                }}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 p-0"
                                disabled={index === arr.length - 1}
                                onClick={() => {
                                  const next = arr[index + 1];
                                  if (next) {
                                    updateActivity(a.id, { sort_order: next.sort_order || index + 1 });
                                    updateActivity(next.id, { sort_order: a.sort_order || index });
                                  }
                                }}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingId(a.id);
                                setEditLabel(a.label);
                              }}
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('Excluir atividade?')) deleteActivity(a.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}

                        <div className="h-4 w-px bg-border mx-1" />

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={a.active}
                            onCheckedChange={(checked) => toggleActivity(a.id, checked)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma atividade cadastrada ainda.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bloco de regras de emergencial */}
        <Card>
          <CardHeader>
            <CardTitle>Regras de Emergencial</CardTitle>
            <CardDescription>
              Defina se o horário emergencial pode ser presencial ou apenas online.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Permitir emergencial presencial</p>
              <p className="text-xs text-muted-foreground">
                Quando desativado, emergencial será permitido apenas para atendimentos online.
              </p>
            </div>
            {loading ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <Switch
                checked={!onlyOnlineEmergencial}
                onCheckedChange={handleToggleEmergencialPresential}
              />
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default Config;


