import { Calendar, ChevronDown, Filter, MoreHorizontal, Search } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

export function TopSessionBar() {
  return (
    <header className="topbar">
      <div>
        <div className="title-row">
          <h1>Mori 앱 기획</h1>
          <ChevronDown size={16} />
          <Badge tone="green">진행 중</Badge>
        </div>
        <p>오늘 2026.05.12 (화) 13:00 - 18:00</p>
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
