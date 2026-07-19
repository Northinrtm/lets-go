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
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState("");
  const [activeTab, setActiveTab] = useState<"today" | "favorites">("today");
  const [manualQuery, setManualQuery] = useState("");
  const [telegramUserId, setTelegramUserId] = useState<string | null>(null);

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

  function addCustomInterest() {
    const value = customInterest.trim();
    if (!value) return;
    if (!selected.includes(value)) setSelected((current) => [...current, value]);
    setCustomInterest("");
    setAddingInterest(false);
    setNotice(`Добавили интерес «${value}»`);
  }

  async function searchEvents(searchText = interestText) {
    setSearching(true);
    setSearchResult("");
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interestText: searchText, interests: selected, date: "в ближайшие 7 дней" }) });
      const data = await response.json();
      setSearchResult(data.result || data.error || "Ничего не нашли");
    } catch {
      setSearchResult("Поиск временно недоступен");
    } finally {
      setSearching(false);
    }
  }

  async function runManualSearch() {
    if (!manualQuery.trim()) return;
    setInterestText(manualQuery.trim());
    setNotice("ИИ ищет события по запросу…");
    await searchEvents(manualQuery.trim());
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

  return (
    <main className="page">
      <div className="container">
        <nav className="nav"><div className="logo"><span className="logo-mark">↗</span> LetsGo</div><div className="mini-label">Москва</div></nav>
        <section className="hero compact-hero"><div className="eyebrow">ТВОЯ АФИША</div><h1>Пойдём?</h1><p className="lead">События в Москве, которые подходят именно тебе.</p></section>
        <section className="interest-card"><div className="section-title"><div><h2>Твои интересы</h2><span className="card-caption">ИИ ищет по этому описанию</span></div><span className="hint">изменить</span></div><textarea className="interest-editor" value={interestText} onChange={(event) => setInterestText(event.target.value)} placeholder="Например: люблю джаз, необычные выставки и фестивали еды" /><div className="interest-list">{interests.map((interest) => <button key={interest} className={`interest ${selected.includes(interest) ? "active" : ""}`} onClick={() => toggleInterest(interest)}>{interest}</button>)}{selected.filter((interest) => !interests.includes(interest)).map((interest) => <button key={interest} className="interest active custom" onClick={() => toggleInterest(interest)}>{interest} ×</button>)}<button className="interest add-interest" onClick={() => setAddingInterest(true)}>＋ свой интерес</button></div>{addingInterest && <div className="custom-interest"><input autoFocus value={customInterest} onChange={(event) => setCustomInterest(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCustomInterest()} placeholder="Например, средневековый фестиваль" /><button className="primary" onClick={addCustomInterest}>Добавить</button><button className="secondary" onClick={() => setAddingInterest(false)}>Отмена</button></div>}<button className="find-button" onClick={() => searchEvents()} disabled={searching}>{searching ? "Ищем события…" : "Обновить подборку"}</button></section>
        <section className="manual-search"><div className="section-title"><div><h2>Найти событие</h2><span className="card-caption">Разовый поиск по конкретному запросу</span></div></div><div className="manual-row"><input value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runManualSearch()} placeholder="Средневековый фестиваль" /><button className="primary" onClick={runManualSearch} disabled={searching}>Искать</button></div>{searchResult && <pre className="search-result">{searchResult}</pre>}</section>
        <section className="results-section"><div className="tabs"><button className={activeTab === "today" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("today")}>Сегодня</button><button className={activeTab === "favorites" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("favorites")}>Избранное <span className="tab-count">{favoriteEvents.length}</span></button></div><div className="events">{visibleEvents.length ? visibleEvents.map((event) => <article className="card" key={event.id}><div className="card-top"><div className="tag">{event.category}</div><button className="heart" onClick={() => saveEvent(event.id)} aria-label="Добавить в избранное">{saved.includes(event.id) ? "♥" : "♡"}</button></div><h3>{event.title}</h3><div className="date">{event.date}<br />{event.venue}</div><p className="reason">{event.reason}</p><div className="actions"><button className="primary" onClick={() => sendToTelegram(event.id)}>Пойдём?</button><button className="secondary" onClick={() => toggleReminder(event.id)}>{reminders.includes(event.id) ? "Напомню" : "Напомнить"}</button></div></article>) : <p className="empty">Пока нет избранных событий.</p>}</div></section>
        {notice && <div className="notice" role="status">{notice}</div>}
      </div>
    </main>
  );
}
