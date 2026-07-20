"use client";

import { useEffect, useState } from "react";
import type { EventItem } from "@/lib/events";

export default function Home() {
  const [interestText, setInterestText] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [places, setPlaces] = useState<EventItem[]>([]);
  const [history, setHistory] = useState<EventItem[]>([]);
  const [newEvents, setNewEvents] = useState<EventItem[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [searchingInterest, setSearchingInterest] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<"interests" | "events" | "places" | "history" | "new" | "favorites">("interests");
  const [interestRows, setInterestRows] = useState([""]);

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
    fetch(`/api/profile?telegramUserId=${encodeURIComponent(telegramUserId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const savedText = data?.profile?.interest_text || "";
        const rows = savedText ? savedText.split(/\.\s+/).filter(Boolean) : [""];
        setInterestRows(rows);
        setInterestText(savedText);
        setProfileId(data?.profile?.id || null);
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, [telegramUserId]);

  useEffect(() => {
    if (!telegramUserId || !profileLoaded) return;
    fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ telegramUserId, interestText, interestRows }) }).catch(() => undefined);
  }, [telegramUserId, interestText, interestRows, profileLoaded]);

  useEffect(() => {
    Promise.all([fetch("/api/events?kind=events"), fetch("/api/events?kind=places"), fetch("/api/events?new=true"), fetch("/api/events?history=true")])
      .then(async ([eventsResponse, placesResponse, newResponse, historyResponse]) => {
        const eventsData = eventsResponse.ok ? await eventsResponse.json() : null;
        const placesData = placesResponse.ok ? await placesResponse.json() : null;
        const newData = newResponse.ok ? await newResponse.json() : null;
        const historyData = historyResponse.ok ? await historyResponse.json() : null;
        setEvents(eventsData?.events || []);
        setPlaces(placesData?.events || []);
        setNewEvents(newData?.events || []);
        setHistory(historyData?.events || []);
      })
      .catch(() => { setEvents([]); setPlaces([]); setNewEvents([]); setHistory([]); });
  }, [telegramUserId]);

  useEffect(() => {
    if (!profileId) return;
    fetch(`/api/favorites?profileId=${encodeURIComponent(profileId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const rows = data?.favorites || [];
        setSaved(rows.map((row: { event_id: string }) => row.event_id));
        setReminders(rows.filter((row: { reminder_enabled: boolean }) => row.reminder_enabled).map((row: { event_id: string }) => row.event_id));
      }).catch(() => undefined);
  }, [profileId]);

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

  async function searchInterest(index: number, kind: "events" | "places") {
    const interest = interestRows[index]?.trim();
    if (!interest) { setNotice("Сначала напиши интерес"); return; }
    setSearchingInterest(`${index}-${kind}`);
    setNotice("");
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interests: [interest], kind }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить поиск");
      const found = (data.results || []).flatMap((item: { result?: string }) => {
        try { const parsed = JSON.parse(item.result || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      });
      if (!found.length) { setNotice("По этому интересу ничего не найдено"); return; }
      await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: found.map((item: Record<string, unknown>) => ({ ...item, kind })) }) });
      const [eventsResponse, placesResponse, newResponse, historyResponse] = await Promise.all([fetch("/api/events?kind=events"), fetch("/api/events?kind=places"), fetch("/api/events?new=true"), fetch("/api/events?history=true")]);
      setEvents((await eventsResponse.json()).events || []);
      setPlaces((await placesResponse.json()).events || []);
      setNewEvents((await newResponse.json()).events || []);
      setHistory((await historyResponse.json()).events || []);
      setActiveSection(kind === "places" ? "places" : "events");
      setNotice(`Найдено: ${found.length}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Поиск не выполнен");
    } finally { setSearchingInterest(null); }
  }

  const allItems = [...events, ...places];
  const favoriteEvents = allItems.filter((event) => saved.includes(event.id));

  function saveEvent(id: string) {
    const isSaved = saved.includes(id);
    setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);
    if (profileId) fetch("/api/favorites", { method: isSaved ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, eventId: id, reminderEnabled: false }) }).catch(() => undefined);
    setNotice("Список обновлён");
  }

  function toggleReminder(id: string) {
    const enabled = !reminders.includes(id);
    setReminders((current) => enabled ? [...current, id] : current.filter((item) => item !== id));
    if (profileId) fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, eventId: id, reminderEnabled: enabled }) }).catch(() => undefined);
    setNotice(enabled ? "Напоминание включено: бот напишет за неделю" : "Напоминание отключено");
  }

  function renderEvents(eventsToShow: EventItem[]) {
    return <div className="events">{eventsToShow.length ? eventsToShow.map((event) => <article className="card" key={event.id}><div className="card-top"><div className="tag">{event.category}</div><button className="heart" onClick={() => saveEvent(event.id)} aria-label="Добавить в избранное">{saved.includes(event.id) ? "♥" : "♡"}</button></div><h3>{event.title}</h3><div className="date">{event.date}<br />{event.venue}</div><p className="reason">{event.reason}</p><div className="actions"><button className="primary" onClick={() => window.open(event.url, "_blank", "noopener,noreferrer")}>Пойдём?</button><button className="secondary" onClick={() => toggleReminder(event.id)}>{reminders.includes(event.id) ? "Напомню" : "Напомнить"}</button></div></article>) : <p className="empty">Пока ничего не найдено.</p>}</div>;
  }

  return (
    <main className="page">
      <div className="container">
        <nav className="nav"><div className="logo">Пойдём?</div><div className="mini-label">Москва</div></nav>
        <div className="top-tabs"><button className={activeSection === "interests" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("interests")}>Интересы</button><button className={activeSection === "events" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("events")}>События</button><button className={activeSection === "places" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("places")}>Места</button><button className={activeSection === "history" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("history")}>История</button><button className={activeSection === "new" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("new")}>Новое <span>{newEvents.length}</span></button><button className={activeSection === "favorites" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("favorites")}>♥ <span>{favoriteEvents.length}</span></button></div>
        {activeSection === "interests" && <section className="tab-page"><div className="interest-rows">{interestRows.map((row, index) => <div className="interest-row" key={index}><input value={row} onChange={(event) => updateInterestRow(index, event.target.value)} placeholder="Например: экотропа" aria-label={`Интерес ${index + 1}`} /><div className="search-actions"><button className="search-interest" onClick={() => searchInterest(index, "events")} disabled={searchingInterest !== null}>{searchingInterest === `${index}-events` ? <span className="search-loader"><span>🌍</span><i>🤴</i></span> : "События"}</button><button className="search-interest place-search" onClick={() => searchInterest(index, "places")} disabled={searchingInterest !== null}>{searchingInterest === `${index}-places` ? <span className="search-loader"><span>🌍</span><i>🤴</i></span> : "Места"}</button></div>{interestRows.length > 1 && <button className="remove-row" onClick={() => removeInterestRow(index)} aria-label="Удалить интерес">×</button>}</div>)}<button className="add-row" onClick={addInterestRow}>＋ Добавить интерес</button></div></section>}
        {activeSection === "events" && <section className="tab-page">{renderEvents(events)}</section>}
        {activeSection === "places" && <section className="tab-page">{renderEvents(places)}</section>}
        {activeSection === "history" && <section className="tab-page"><div className="history-head"><span>Все найденные события и места</span><button onClick={() => { setHistory([]); setNotice("История очищена"); }}>Очистить</button></div>{renderEvents(history)}</section>}
        {activeSection === "new" && <section className="tab-page">{renderEvents(newEvents)}</section>}
        {activeSection === "favorites" && <section className="tab-page"><p className="favorites-hint">Выберите событие и включите напоминание — бот напишет за неделю до начала.</p>{renderEvents(favoriteEvents)}</section>}
        {notice && <div className="notice" role="status">{notice}</div>}
      </div>
    </main>
  );
}
