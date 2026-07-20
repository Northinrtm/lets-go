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
  const [newPlaces, setNewPlaces] = useState<EventItem[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [searchingInterest, setSearchingInterest] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<string | null>(null);
  const [telegramInitData, setTelegramInitData] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [mode, setMode] = useState<"events" | "places">("events");
  const [activeSection, setActiveSection] = useState<"interests" | "events" | "search" | "history" | "new" | "favorites">("interests");
  const [interestRows, setInterestRows] = useState([""]);
  const [placeQuery, setPlaceQuery] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => {
      const telegram = (window as Window & { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData?: string; initDataUnsafe?: { user?: { id: number } } } } }).Telegram?.WebApp;
      telegram?.ready();
      telegram?.expand();
      const userId = telegram?.initDataUnsafe?.user?.id;
      if (userId) setTelegramUserId(String(userId));
      if (telegram?.initData) setTelegramInitData(telegram.initData);
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  useEffect(() => {
    if (!telegramInitData) return;
    fetch(`/api/profile?initData=${encodeURIComponent(telegramInitData)}`)
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
  }, [telegramInitData]);

  useEffect(() => {
    if (!telegramUserId || !profileLoaded) return;
    fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: telegramInitData, interestText, interestRows }) }).catch(() => undefined);
  }, [telegramInitData, interestText, interestRows, profileLoaded, telegramUserId]);

  useEffect(() => {
    if (!profileId) return;
    const profileQuery = `&profileId=${encodeURIComponent(profileId)}`;
    Promise.all([fetch(`/api/events?kind=events${profileQuery}`), fetch(`/api/events?kind=places${profileQuery}`), fetch(`/api/events?kind=events&new=true${profileQuery}`), fetch(`/api/events?kind=places&new=true${profileQuery}`), fetch(`/api/events?history=true${profileQuery}`)])
      .then(async ([eventsResponse, placesResponse, newEventsResponse, newPlacesResponse, historyResponse]) => {
        const eventsData = eventsResponse.ok ? await eventsResponse.json() : null;
        const placesData = placesResponse.ok ? await placesResponse.json() : null;
        const newEventsData = newEventsResponse.ok ? await newEventsResponse.json() : null;
        const newPlacesData = newPlacesResponse.ok ? await newPlacesResponse.json() : null;
        const historyData = historyResponse.ok ? await historyResponse.json() : null;
        setEvents(eventsData?.events || []);
        setPlaces(placesData?.events || []);
        setNewEvents(newEventsData?.events || []);
        setNewPlaces(newPlacesData?.events || []);
        setHistory(historyData?.events || []);
      })
      .catch(() => { setEvents([]); setPlaces([]); setNewEvents([]); setNewPlaces([]); setHistory([]); });
  }, [profileId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  async function runSearch(interest: string, kind: "events" | "places", key: string) {
    if (!interest) { setNotice("Сначала напиши интерес"); return; }
    if (!profileId) { setNotice("Не удалось определить Telegram-профиль"); return; }
    setSearchingInterest(key);
    setNotice("");
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interests: [interest], kind, profileId, background: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error || "Не удалось выполнить поиск"}${data.retryAfterSeconds ? ` Повторить через ${data.retryAfterSeconds} сек.` : ""}`);
      if (response.status === 202) { setActiveSection(kind === "places" ? "search" : "events"); setNotice("Поиск запущен в фоне. Можно закрыть приложение — результаты появятся после завершения."); return; }
      const found = (data.results || []).flatMap((item: { result?: string }) => {
        try { const parsed = JSON.parse(item.result || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      });
      if (!found.length) { setNotice("По этому интересу ничего не найдено"); return; }
      const saveResponse = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, events: found.map((item: Record<string, unknown>) => ({ ...item, kind })) }) });
      if (!saveResponse.ok) throw new Error("Не удалось сохранить найденные результаты");
      const profileQuery = `&profileId=${encodeURIComponent(profileId || "")}`;
      const [eventsResponse, placesResponse, newEventsResponse, newPlacesResponse, historyResponse] = await Promise.all([fetch(`/api/events?kind=events${profileQuery}`), fetch(`/api/events?kind=places${profileQuery}`), fetch(`/api/events?kind=events&new=true${profileQuery}`), fetch(`/api/events?kind=places&new=true${profileQuery}`), fetch(`/api/events?history=true${profileQuery}`)]);
      setEvents((await eventsResponse.json()).events || []);
      setPlaces((await placesResponse.json()).events || []);
      setNewEvents((await newEventsResponse.json()).events || []);
      setNewPlaces((await newPlacesResponse.json()).events || []);
      setHistory((await historyResponse.json()).events || []);
      setMode(kind);
      setActiveSection(kind === "places" ? "search" : "events");
      setNotice(`Найдено: ${found.length}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Поиск не выполнен");
    } finally { setSearchingInterest(null); }
  }

  function searchInterest(index: number) {
    return runSearch(interestRows[index]?.trim() || "", "events", `${index}-events`);
  }

  function searchPlace() {
    return runSearch(placeQuery.trim(), "places", "places");
  }

  const allItems = [...events, ...places];
  const favoriteEvents = allItems.filter((event) => saved.includes(event.id));
  const favoritePlaces = places.filter((event) => saved.includes(event.id));

  function switchMode(nextMode: "events" | "places") {
    setMode(nextMode);
    setActiveSection(nextMode === "events" ? "interests" : "search");
  }

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
        <div className="top-tabs mode-tabs"><button className={mode === "events" ? "top-tab active-top-tab" : "top-tab"} onClick={() => switchMode("events")}>События</button><button className={mode === "places" ? "top-tab active-top-tab" : "top-tab"} onClick={() => switchMode("places")}>Места</button></div>
        <div className="top-tabs sub-tabs">{mode === "events" ? <><button className={activeSection === "interests" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("interests")}>Интересы</button><button className={activeSection === "events" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("events")}>События</button></> : <><button className={activeSection === "search" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("search")}>Поиск</button><button className={activeSection === "history" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("history")}>История</button></>}<button className={activeSection === "new" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("new")}>Новое <span>{(mode === "events" ? newEvents : newPlaces).length}</span></button><button className={activeSection === "favorites" ? "top-tab active-top-tab" : "top-tab"} onClick={() => setActiveSection("favorites")}>♥ <span>{(mode === "events" ? favoriteEvents : favoritePlaces).length}</span></button></div>
        {mode === "events" && activeSection === "interests" && <section className="tab-page"><div className="interest-rows">{interestRows.map((row, index) => <div className="interest-row" key={index}><input value={row} onChange={(event) => updateInterestRow(index, event.target.value)} placeholder="Например: средневековые фестивали" aria-label={`Интерес ${index + 1}`} /><div className="search-actions"><button className="search-interest" onClick={() => searchInterest(index)} disabled={searchingInterest !== null}>Искать</button></div>{interestRows.length > 1 && <button className="remove-row" onClick={() => removeInterestRow(index)} aria-label="Удалить интерес">×</button>}</div>)}<button className="add-row" onClick={addInterestRow}>＋ Добавить интерес</button></div></section>}
        {mode === "places" && activeSection === "search" && <section className="tab-page"><div className="place-search-form"><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="Например: экотропа, необычные музеи" aria-label="Поиск мест" /><button className="primary" onClick={searchPlace} disabled={searchingInterest !== null}>Искать места</button></div></section>}
        {mode === "events" && activeSection === "events" && <section className="tab-page">{renderEvents(events)}</section>}
        {mode === "places" && activeSection === "history" && <section className="tab-page"><div className="history-head"><span>Все найденные места</span><button onClick={() => { setHistory([]); setNotice("История очищена"); }}>Очистить</button></div>{renderEvents(history.filter((item) => !item.category || item.category === "Место"))}</section>}
        {activeSection === "new" && <section className="tab-page">{renderEvents(mode === "events" ? newEvents : newPlaces)}</section>}
        {activeSection === "favorites" && <section className="tab-page"><p className="favorites-hint">Выберите событие и включите напоминание — бот напишет за неделю до начала.</p>{renderEvents(mode === "events" ? favoriteEvents : favoritePlaces)}</section>}
        {searchingInterest && <div className="search-overlay" role="status" aria-live="polite"><div className="search-orbit"><span>🌍</span><i>🤴</i></div><p>Ищем подходящее…</p></div>}
        {notice && <div className="notice" role="status">{notice}</div>}
      </div>
    </main>
  );
}
