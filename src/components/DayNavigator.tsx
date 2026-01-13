import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DayNavigatorProps {
  days: Date[];
  activeDayIndex: number;
  onDayClick: (index: number) => void;
}

export const DayNavigator = ({ days, activeDayIndex, onDayClick }: DayNavigatorProps) => {
  return (
    <div id="day-navigator" className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1 -mx-1 touch-pan-x scroll-smooth no-scrollbar">
      {days.map((day, index) => {
        const isToday = format(new Date(), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
        const isActive = activeDayIndex === index;

        return (
          <Button
            key={index}
            id={`day-card-${index}`}
            variant={isActive ? "default" : "outline"}
            size="lg"
            onClick={() => onDayClick(index)}
            className={cn(
              "flex-col h-auto py-4 px-5 min-w-[90px] shrink-0 transition-all touch-manipulation",
              isToday && !isActive && "border-primary border-2",
              isActive && "shadow-lg scale-105"
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isToday ? "HOJE" : format(day, "EEE", { locale: ptBR })}
            </span>
            <span className="text-2xl font-bold mt-1">
              {format(day, "dd")}
            </span>
          </Button>
        );
      })}
    </div>
  );
};
