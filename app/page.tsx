"use client";

import { useEffect, useState } from "react";
import { demoEvents } from "@/lib/events";
import type { EventItem } from "@/lib/events";

const interests = ["Музыка", "Театр", "Выставки", "Кино", "Стендап", "Спорт", "Лекции", "Еда"];

export default function Home() {
  const [selected, setSelected] = useState<string[]>(["Музыка", "Выставки"]);
  const [interestText, setInterestText] = useState("Люблю музыку, небольшие выставки и средневековые фестивали");
  const [customInterest, setCustomInterest] = useState("");
  const [addingInterest, setAddingInterest] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"today" | "favorites">("today");
  const [telegramUserId, setTelegramUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"interests" | "events" | "favorites">("interests");
  const [interestRows, setInterestRows] = useState(["Люблю музыку, небольшие выставки и средневековые фестивали"]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => {
      const telegram = (window as Window & { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: { id: number } } } } }).Telegram?.WebApp;
      telegram?.ready();
      telegram?.expand();
      const userId = telegram?.initDataUnsafe?.user?.id;
      if (userId) setTelegramUserId(String(userId));
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  useEffect(() => {
    if (!telegramUserId) return;
    fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ telegramUserId, interestText }) }).catch(() => undefined);
  }, [telegramUserId, interestText]);

  function toggleInterest(interest: string) {
    setSelected((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]);
  }

  function updateInterestRow(index: number, value: string) {
    setInterestRows((current) => current.map((row, rowIndex) => rowIndex === index ? value : row));
    setInterestText(interestRows.map((row, rowIndex) => rowIndex === index ? value : row).filter(Boolean).join(". "));
  }

  function addInterestRow() {
    setInterestRows((current) => [...current, ""]);
  }

  function removeInterestRow(index: number) {
    const next = interestRows.filter((_, rowIndex) => rowIndex !== index);
    setInterestRows(next.length ? next : [""]);
    setInterestText(next.filter(Boolean).join(". "));
  }

  function addCustomInterest() {
    const value = customInterest.trim();
    if (!value) return;
    if (!selected.includes(value)) setSelected((current) => [...current, value]);
    setCustomInterest("");
    setAddingInterest(false);
    setNotice(`Добавили интерес «${value}»`);
  }

  const favoriteEvents = demoEvents.filter((event) => saved.includes(event.id));
  const visibleEvents: EventItem[] = activeTab === "favorites" ? favoriteEvents : demoEvents;

  function saveEvent(id: string) {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setNotice("Список обновлён");
  }

  function toggleReminder(id: string) {
    setReminders((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setNotice(reminders.includes(id) ? "Напоминание отключено" : "Напоминание включено: пришлём за неделю");
  }

  async function sendToTelegram(id: string) {
    setNotice("Для отправки подключите Telegram-бота");
    await fetch("/api/telegram/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventIds: [id] }) }).catch(() => undefined);
  }

  function renderEvents(eventsToShow: EventItem[]) {
    return <div className="events">{eventsToShow.length ? eventsToShow.map((event) => <article className="card" key={event.id}><div className="card-top"><div className="tag">{event.category}</div><button className="heart" onClick={() => saveEvent(event.id)} aria-label="Добавить в избранное">{saved.includes(event.id) ? "♥" : "♡"}</button></div><h3>{event.title}</h3><div className="date">{event.date}<br />{event.venue}</div><p className="reason">{event.reason}</p><div className="actions"><button className="primary" onClick={() => sendToTelegram(event.id)}>Пойдём?</button><button className="secondary" onClick={() => toggleReminder(event.id)}>{reminders.includes(event.id) ? "Напомню" : "Напомнить"}</button></div></article>) : <p className="empty">Пока здесь ничего нет.</p>}</div>;
  }

  return (
    <main className="page">
      <div className="container">
        <nav className="nav"><div className="logo">Пойдём?</div><div className="mini-label">Москва</div></nav>
        <div className="top-tabs"><button className={activeSection === "interests" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("interests")}>Интересы</button><button className={activeSection === "events" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("events")}>События</button><button className={activeSection === "favorites" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("favorites")}>♥ <span>{favoriteEvents.length}</span></button></div>
        {activeSection === "interests" && <section className="tab-page"><div className="interest-rows">{interestRows.map((row, index) => <div className="interest-row" key={index}><input value={row} onChange={(event) => updateInterestRow(index, event.target.value)} placeholder="Например: средневековые фестивали" aria-label={`Интерес ${index + 1}`} />{interestRows.length > 1 && <button className="remove-row" onClick={() => removeInterestRow(index)} aria-label="Удалить интерес">×</button>}</div>)}<button className="add-row" onClick={addInterestRow}>＋ Добавить интерес</button></div></section>}
        {activeSection === "events" && <section className="tab-page">{renderEvents(demoEvents)}</section>}
        {activeSection === "favorites" && <section className="tab-page">{renderEvents(favoriteEvents)}</section>}
        {notice && <div className="notice" role="status">{notice}</div>}
      </div>
    </main>
  );
}
