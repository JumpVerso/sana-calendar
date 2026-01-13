import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, addWeeks, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WeekSelectorProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export const WeekSelector = ({ currentDate, onDateChange }: WeekSelectorProps) => {
  return (
    <div className="flex items-center justify-between gap-2 mb-6">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onDateChange(subWeeks(currentDate, 1))}
        className="shrink-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="flex items-center gap-2 min-w-0">
        <Calendar className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-semibold text-sm sm:text-base truncate">
          {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
      </div>
      
      <Button
        variant="outline"
        size="icon"
        onClick={() => onDateChange(addWeeks(currentDate, 1))}
        className="shrink-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
