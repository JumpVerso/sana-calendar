import { useState, useEffect } from "react";
import { PRICE_TABLE } from "@/constants/business-rules";
import { personalActivitiesAPI } from "@/api/personalActivitiesAPI";

export type Modality = "online" | "presential";
export type PriceCategory = "padrao" | "promocional" | "emergencial";

export interface PriceConfig {
  id: string;
  modality: Modality;
  category: PriceCategory;
  value: number; // Valor em centavos
}

export interface PersonalActivity {
  id: string;
  label: string;
  active: boolean;
  sort_order: number;
}

export interface AppConfig {
  id: string;
  only_online_emergencial: boolean;
  startHour: number;
  endHour: number;
}

interface SettingsState {
  priceConfig: PriceConfig[];
  activities: PersonalActivity[];
  appConfig: AppConfig;
  loading: boolean;
}

// Generate price config from constants
const generatePriceConfig = (): PriceConfig[] => {
  const items: PriceConfig[] = [];
  (Object.keys(PRICE_TABLE) as Modality[]).forEach(modality => {
    (Object.keys(PRICE_TABLE[modality]) as PriceCategory[]).forEach(category => {
      items.push({
        id: `${modality}-${category}`,
        modality,
        category,
        value: PRICE_TABLE[modality][category],
      });
    });
  });
  return items;
};



const DEFAULT_CONFIG: AppConfig = {
  id: "default",
  only_online_emergencial: true,
  startHour: 6,
  endHour: 22
};

const STORAGE_KEY = "@jumpverso-calendar:settings-v1";

export const useSettings = () => {
  // Initialize state from localStorage or defaults
  const [state, setState] = useState<SettingsState>(() => {
    let initialPriceConfig = generatePriceConfig();
    let initialAppConfig = DEFAULT_CONFIG;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        initialPriceConfig = parsed.priceConfig || initialPriceConfig;
        initialAppConfig = { ...DEFAULT_CONFIG, ...(parsed.appConfig || {}) };
      }
    } catch (e) {
      console.error("Failed to load settings from storage", e);
    }

    return {
      priceConfig: initialPriceConfig,
      activities: [], // Will fetch from DB
      appConfig: initialAppConfig,
      loading: true, // Start loading
    };
  });

  // Fetch activities from DB
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const activities = await personalActivitiesAPI.getAll();
        setState(prev => ({ ...prev, activities, loading: false }));
      } catch (error) {
        console.error("Failed to fetch activities", error);
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    fetchActivities();
  }, []);

  const saveToStorage = (newState: SettingsState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        priceConfig: newState.priceConfig,
        // activities: newState.activities, // Managed in DB now
        appConfig: newState.appConfig
      }));
    } catch (e) {
      console.error("Failed to save settings to storage", e);
    }
  };

  const updatePriceConfig = async (newConfig: PriceConfig[]) => {
    setState(prev => {
      const newState = { ...prev, priceConfig: newConfig };
      saveToStorage(newState);
      return newState;
    });
  };

  const addActivity = async (label: string) => {
    try {
      const newActivity = await personalActivitiesAPI.create(label);
      setState(prev => ({
        ...prev,
        activities: [...prev.activities, newActivity]
      }));
    } catch (error) {
      console.error("Failed to add activity", error);
    }
  };

  const toggleActivity = async (id: string, active: boolean) => {
    // Optimistic update
    setState(prev => ({
      ...prev,
      activities: prev.activities.map(a => a.id === id ? { ...a, active } : a)
    }));

    try {
      await personalActivitiesAPI.toggleActive(id, active);
    } catch (error) {
      console.error("Failed to toggle activity", error);
      // Revert on error? For now simple log.
    }
  };

  const updateActivity = async (id: string, updates: Partial<PersonalActivity>) => {
    // Optimistic
    setState(prev => ({
      ...prev,
      activities: prev.activities.map(a => a.id === id ? { ...a, ...updates } : a)
    }));

    try {
      await personalActivitiesAPI.update(id, updates);
    } catch (error) {
      console.error("Failed to update activity", error);
      // Revert/Fetch?
    }
  };

  const deleteActivity = async (id: string) => {
    // Optimistic
    setState(prev => ({
      ...prev,
      activities: prev.activities.filter(a => a.id !== id)
    }));

    try {
      await personalActivitiesAPI.delete(id);
    } catch (error) {
      console.error("Failed to delete activity", error);
    }
  };

  const updateAppConfig = async (config: Partial<AppConfig>) => {
    setState(prev => {
      const newAppConfig = { ...prev.appConfig, ...config };
      const newState = { ...prev, appConfig: newAppConfig };
      saveToStorage(newState);
      return newState;
    });
  };

  return {
    ...state,
    updatePriceConfig,
    addActivity,
    toggleActivity,
    updateActivity,
    deleteActivity,
    updateAppConfig,
  };
};
