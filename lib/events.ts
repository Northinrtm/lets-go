export type EventItem = {
  id: string;
  category: string;
  title: string;
  date: string;
  venue: string;
  url: string;
  reason: string;
};

export const demoEvents: EventItem[] = [
  { id: "concert-open-air", category: "Музыка", title: "Концерт под открытым небом", date: "Сегодня, 19:00", venue: "Сад Эрмитаж", url: "https://example.com", reason: "Подходит под интерес к музыке и городским событиям." },
  { id: "modern-art", category: "Выставки", title: "Новая выставка современного искусства", date: "Завтра, 12:00", venue: "Музей Москвы", url: "https://example.com", reason: "Нашли выставку в Москве на ближайшие дни." },
  { id: "standup-night", category: "Стендап", title: "Вечер новой комедии", date: "25 июля, 20:00", venue: "Центр города", url: "https://example.com", reason: "Подходит для лёгкого вечернего досуга." },
];
