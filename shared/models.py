from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class Hackathon:
    source_id: str          # PK: "connpass#12345"
    title: str
    source_url: str
    source_name: str        # connpass / doorkeeper / devpost / web
    start_date: str         # YYYY-MM-DD
    end_date: str           # YYYY-MM-DD
    entry_deadline: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    is_online: bool = False
    online_status: str = "OFFLINE"   # ONLINE / OFFLINE / HYBRID
    prize_amount: int = 0
    prize_bucket: str = "NO_PRIZE"   # NO_PRIZE / SMALL / LARGE
    themes: list = field(default_factory=list)
    is_beginner_friendly: bool = False
    status: str = "UPCOMING"         # UPCOMING / PAST
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dynamo_item(self) -> dict:
        item = {
            "source_id": self.source_id,
            "title": self.title,
            "source_url": self.source_url,
            "source_name": self.source_name,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "is_online": self.is_online,
            "online_status": self.online_status,
            "prize_amount": self.prize_amount,
            "prize_bucket": self.prize_bucket,
            "is_beginner_friendly": self.is_beginner_friendly,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if self.entry_deadline:
            item["entry_deadline"] = self.entry_deadline
        if self.description:
            item["description"] = self.description
        if self.location:
            item["location"] = self.location
        if self.themes:
            item["themes"] = self.themes
        return item


def compute_prize_bucket(amount: int) -> str:
    if amount <= 0:
        return "NO_PRIZE"
    if amount <= 100_000:
        return "SMALL"
    return "LARGE"


def compute_status(start_date: str) -> str:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return "UPCOMING" if start_date >= today else "PAST"
