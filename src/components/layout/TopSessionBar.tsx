import { ChevronDown, Search } from "lucide-react";
import { Badge } from "../ui/Badge";
import { useMoriAppStore } from "../../app/store";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";

export function TopSessionBar() {
  const view = useMoriSessionStore(selectSessionView);
  const searchQuery = useMoriAppStore((state) => state.searchQuery);
  const setSearchQuery = useMoriAppStore((state) => state.setSearchQuery);
  const statusLabel =
    view.session.status === "recording"
      ? "진행 중"
      : view.session.status === "analyzing"
        ? "분석 중"
        : "완료";
  const statusTone: "green" | "purple" | "gray" =
    view.session.status === "recording"
      ? "green"
      : view.session.status === "analyzing"
        ? "purple"
        : "gray";
  const started = new Date(view.session.startedAt);
  const ended = new Date(view.session.endedAt);
  const sameDay = started.toDateString() === ended.toDateString();
  const dateLine = sameDay
    ? `${started.toLocaleDateString()} ${started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${ended.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : `${started.toLocaleString()} → ${ended.toLocaleString()}`;

  return (
    <header className="topbar">
      <div className="topbar-title">
        <div className="title-row">
          <h1>{view.session.title}</h1>
          <ChevronDown size={16} aria-hidden="true" />
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </div>
        <p>{dateLine}</p>
      </div>
      <div className="topbar-search" aria-label="Search timeline events">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="이벤트 검색..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search events"
        />
        <kbd>⌘K</kbd>
      </div>
    </header>
  );
}
