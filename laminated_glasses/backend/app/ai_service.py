"""AI (Gemini) limitlari va holati -- yagona joyda.

Limit turlari (hammasi "sirpanuvchi 24 soat" oynasida):
  1) butun sayt bo'yicha kunlik limit   (AiConfig.daily_limit)  -- Gemini hisobingizni himoya qiladi
  2) bitta Gmail akkaunt uchun limit    (AiConfig.per_user_limit)
  3) Google'ning o'z kvotasi (429)      -- AiConfig.provider_blocked_until bilan vaqtincha to'xtatiladi
Faqat MUVAFFAQIYATLI natija ("ok") limitdan hisoblanadi: xato/rad etilgan urinish
foydalanuvchi limitini yemaydi.
"""

import threading
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config, models

WINDOW = timedelta(hours=24)
RESERVE_TTL = timedelta(minutes=3)   # "jarayonda" yozuv shundan eski bo'lsa, osilib qolgan deb hisoblanadi

_lock = threading.Lock()


class AiLimitReached(Exception):
    def __init__(self, reason: str, retry_after_seconds: int = 0):
        super().__init__(reason)
        self.reason = reason
        self.retry_after_seconds = retry_after_seconds


# --------------------------------------------------------------------------- sozlamalar
def get_config(db: Session) -> models.AiConfig:
    cfg = db.query(models.AiConfig).filter(models.AiConfig.id == 1).first()
    if cfg is None:
        cfg = models.AiConfig(
            id=1,
            enabled=1,
            daily_limit=config.AI_DEFAULT_DAILY_LIMIT,
            per_user_limit=config.AI_DEFAULT_PER_USER_LIMIT,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# --------------------------------------------------------------------------- hisoblash
def _counted(db: Session, since: datetime):
    """Limitdan hisoblanadigan yozuvlar: muvaffaqiyatli + hozir jarayonda bo'lganlar."""
    now = datetime.utcnow()
    return db.query(models.AiUsage).filter(
        models.AiUsage.created_at > since,
        (models.AiUsage.status == "ok")
        | ((models.AiUsage.status == "reserved") & (models.AiUsage.created_at > now - RESERVE_TTL)),
    )


def _oldest_retry(db: Session, q) -> int:
    oldest = q.order_by(models.AiUsage.created_at.asc()).first()
    if oldest is None:
        return 0
    return max(60, int((oldest.created_at + WINDOW - datetime.utcnow()).total_seconds()))


def used_global(db: Session) -> int:
    return _counted(db, datetime.utcnow() - WINDOW).count()


def used_by_customer(db: Session, customer_id: int) -> int:
    return _counted(db, datetime.utcnow() - WINDOW).filter(models.AiUsage.customer_id == customer_id).count()


# --------------------------------------------------------------------------- holat
def _human_wait(seconds: int) -> str:
    if seconds <= 0:
        return "birozdan so'ng"
    mins = max(1, round(seconds / 60))
    if mins < 60:
        return f"taxminan {mins} daqiqadan keyin"
    hours, rem = divmod(mins, 60)
    if rem >= 30:
        hours += 1
    return f"taxminan {hours} soatdan keyin"


_FALLBACK_NOTE = (
    "Hozircha oynani qo'lda joylashtirib ko'rishingiz va rasmni yuklab olishingiz mumkin — "
    "bu imkoniyat cheklovsiz ishlaydi."
)


def message_for(reason: str, retry_after_seconds: int = 0, per_user_limit: int = 0) -> Tuple[str, str]:
    """(sarlavha, matn) -- foydalanuvchiga ko'rsatiladigan chiroyli tushuntirish."""
    wait = _human_wait(retry_after_seconds)
    if reason == "user_limit":
        return (
            "Bugungi AI urinishlaringiz tugadi",
            f"Siz {per_user_limit} ta AI urinishingizdan foydalanib bo'ldingiz. "
            f"Yangi urinish {wait} ochiladi. {_FALLBACK_NOTE}",
        )
    if reason in ("global_limit", "provider_quota"):
        return (
            "AI hozir juda band",
            "Bugun AI xizmatidan juda ko'p foydalanildi va kunlik imkoniyat vaqtincha tugadi. "
            f"Iltimos, {wait} qayta urinib ko'ring. {_FALLBACK_NOTE}",
        )
    # disabled / not_configured / boshqalar
    return (
        "AI ko'rish hozircha mavjud emas",
        f"Bu imkoniyat hozircha ishlamayapti. Tez orada qaytadi. {_FALLBACK_NOTE}",
    )


def evaluate(db: Session, customer: models.Customer) -> dict:
    """Foydalanuvchi hozir AI'dan foydalana oladimi? Hech narsa yozmaydi."""
    cfg = get_config(db)
    now = datetime.utcnow()
    per_user = max(0, cfg.per_user_limit)
    base = {"per_user_limit": per_user, "remaining": None}

    def blocked(reason: str, retry: int = 0, remaining: Optional[int] = None) -> dict:
        title, msg = message_for(reason, retry, per_user)
        return {**base, "available": False, "reason": reason, "title": title, "message": msg,
                "retry_after_seconds": retry, "remaining": remaining}

    if not config.GEMINI_API_KEY:
        return blocked("not_configured")
    if not cfg.enabled:
        return blocked("disabled")
    if cfg.provider_blocked_until and cfg.provider_blocked_until > now:
        return blocked("provider_quota", int((cfg.provider_blocked_until - now).total_seconds()))

    since = now - WINDOW
    g_q = _counted(db, since)
    if cfg.daily_limit <= 0 or g_q.count() >= cfg.daily_limit:
        return blocked("global_limit", _oldest_retry(db, g_q) if cfg.daily_limit > 0 else 0)

    remaining = None
    if not customer.is_staff:
        u_q = _counted(db, since).filter(models.AiUsage.customer_id == customer.id)
        used = u_q.count()
        remaining = max(0, per_user - used)
        if per_user <= 0 or used >= per_user:
            return blocked("user_limit", _oldest_retry(db, u_q) if per_user > 0 else 0, 0)
    return {**base, "available": True, "reason": "", "title": "", "message": "",
            "retry_after_seconds": 0, "remaining": remaining}


# --------------------------------------------------------------------------- band qilish
def reserve(db: Session, customer: models.Customer) -> models.AiUsage:
    """Limitni TEKSHIRIB, bitta "jarayonda" yozuv qo'shadi (bir vaqtda ikki so'rov
    limitdan oshib ketmasligi uchun qulf ichida). Limit tugagan bo'lsa AiLimitReached."""
    with _lock:
        st = evaluate(db, customer)
        if not st["available"]:
            raise AiLimitReached(st["reason"], st["retry_after_seconds"])
        usage = models.AiUsage(customer_id=customer.id, status="reserved", created_at=datetime.utcnow())
        db.add(usage)
        db.commit()
        db.refresh(usage)
        return usage


def finish(db: Session, usage: models.AiUsage, status: str, duration_ms: int, error_code: Optional[str] = None) -> None:
    usage.status = status
    usage.duration_ms = max(0, int(duration_ms))
    usage.error_code = (error_code or None)
    db.commit()


def block_provider(db: Session, seconds: Optional[int] = None) -> None:
    """Google kvotasi tugagan: AI'ni vaqtincha to'xtatamiz."""
    cfg = get_config(db)
    secs = seconds if seconds and seconds > 0 else config.AI_PROVIDER_COOLDOWN_MINUTES * 60
    secs = min(max(secs, 60), 6 * 3600)
    cfg.provider_blocked_until = datetime.utcnow() + timedelta(seconds=secs)
    db.commit()


def purge_old_usage(db: Session) -> int:
    cutoff = datetime.utcnow() - timedelta(days=config.AI_USAGE_KEEP_DAYS)
    n = db.query(models.AiUsage).filter(models.AiUsage.created_at <= cutoff).delete(synchronize_session=False)
    db.commit()
    return n


# --------------------------------------------------------------------------- admin statistikasi
def admin_overview(db: Session) -> dict:
    cfg = get_config(db)
    now = datetime.utcnow()
    since = now - WINDOW
    q24 = db.query(models.AiUsage).filter(models.AiUsage.created_at > since)

    def cnt(status: str) -> int:
        return q24.filter(models.AiUsage.status == status).count()

    week = []
    for i in range(6, -1, -1):
        d0 = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d1 = d0 + timedelta(days=1)
        week.append({
            "date": d0.strftime("%Y-%m-%d"),
            "ok": db.query(models.AiUsage).filter(models.AiUsage.created_at >= d0, models.AiUsage.created_at < d1, models.AiUsage.status == "ok").count(),
            "failed": db.query(models.AiUsage).filter(models.AiUsage.created_at >= d0, models.AiUsage.created_at < d1, models.AiUsage.status.in_(("error", "quota", "blocked"))).count(),
        })
    avg = db.query(func.avg(models.AiUsage.duration_ms)).filter(models.AiUsage.status == "ok", models.AiUsage.created_at > since).scalar()
    return {
        "configured": bool(config.GEMINI_API_KEY),
        "model": config.GEMINI_IMAGE_MODEL,
        "enabled": bool(cfg.enabled),
        "daily_limit": cfg.daily_limit,
        "per_user_limit": cfg.per_user_limit,
        "used_24h": used_global(db),
        "ok_24h": cnt("ok"),
        "error_24h": cnt("error"),
        "quota_24h": cnt("quota"),
        "blocked_24h": cnt("blocked"),
        "avg_seconds": round((avg or 0) / 1000.0, 1),
        "provider_blocked_until": cfg.provider_blocked_until.isoformat() + "Z" if cfg.provider_blocked_until and cfg.provider_blocked_until > now else None,
        "week": week,
    }
