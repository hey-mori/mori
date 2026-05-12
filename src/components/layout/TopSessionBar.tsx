import { Calendar, ChevronDown, Filter, MoreHorizontal, Search } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";

export function TopSessionBar() {
  const view = useMoriSessionStore(selectSessionView);
  const statusLabel = view.session.status === "recording" ? "진행 중" : view.session.status === "analyzing" ? "분석 중" : "완료";
  const started = new Date(view.session.startedAt);
  const ended = new Date(view.session.endedAt);
  const sameDay = started.toDateString() === ended.toDateString();
  const dateLine = sameDay
    ? `${started.toLocaleDateString()} ${started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${ended.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : `${started.toLocaleString()} → ${ended.toLocaleString()}`;

  return (
    <header className="topbar">
      <div>
        <div className="title-row">
          <h1>{view.session.title}</h1>
          <ChevronDown size={16} />
          <Badge tone={view.session.status === "complete" ? "gray" : "green"}>{statusLabel}</Badge>
        </div>
        <p>{dateLine}</p>
      </div>
      <div className="toolbar">
        <div className="segmented">
          <button type="button">일</button>
          <button type="button">주</button>
          <button type="button">세션</button>
        </div>
        <Button icon={Filter}>필터</Button>
        <div className="search">
          <Search size={16} />
          <span>이벤트 검색...</span>
          <kbd>⌘K</kbd>
        </div>
        <Button icon={Calendar} />
        <Button icon={MoreHorizontal} />
      </div>
    </header>
  );
}
