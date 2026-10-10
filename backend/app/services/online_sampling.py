"""The instance-wide, durable online-evaluation sampling override."""

import math

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models

_SAMPLE_RATE_KEY = "online_eval_sample_rate"


def get_online_eval_sample_rate(db: Session) -> float:
    row = db.get(models.OperationalSetting, _SAMPLE_RATE_KEY)
    return float(row.value_json) if row is not None else settings.online_eval_sample_rate


def set_online_eval_sample_rate(db: Session, rate: float) -> float:
    if isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 0 <= rate <= 1 or not math.isfinite(rate):
        raise ValueError("Online evaluation sample rate must be a finite number between 0 and 1")
    rate = float(rate)
    row = db.get(models.OperationalSetting, _SAMPLE_RATE_KEY)
    if row is None:
        try:
            with db.begin_nested():
                db.add(models.OperationalSetting(key=_SAMPLE_RATE_KEY, value_json=rate))
                db.flush()
        except IntegrityError:
            row = db.get(models.OperationalSetting, _SAMPLE_RATE_KEY)
            if row is None:
                raise
            row.value_json = rate
    else:
        row.value_json = rate
    db.commit()
    return rate
