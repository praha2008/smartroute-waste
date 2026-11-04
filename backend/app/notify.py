"""One-time codes by SMS (phone verification) and email (password reset).

Providers
  SMS   : Twilio Verify (generates, sends and checks the code itself)
  Email : Brevo HTTP API, or any SMTP server
  Demo  : if a provider is not configured, the code is stored here and returned to the app
          as `dev_code` so the flow can be shown without paying for SMS.
"""
import base64
import hashlib
import json
import random
import smtplib
import urllib.parse
import urllib.request
from datetime import timedelta
from email.message import EmailMessage

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import OtpCode, utcnow

CODE_TTL_MIN = 10
MAX_ATTEMPTS = 5
MAX_SENDS_PER_HOUR = 5


def dev_mode_for(kind: str) -> bool:
    configured = config.SMS_CONFIGURED if kind == "sms" else config.EMAIL_CONFIGURED
    if configured:
        return False
    if config.OTP_DEV_MODE == "false":
        raise HTTPException(503, f"{'SMS' if kind == 'sms' else 'Email'} sending is not configured on the server")
    return True


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _rate_limit(db: Session, purpose: str, target: str) -> None:
    since = utcnow() - timedelta(hours=1)
    n = db.query(OtpCode).filter(OtpCode.purpose == purpose, OtpCode.target == target, OtpCode.created_at >= since).count()
    if n >= MAX_SENDS_PER_HOUR:
        raise HTTPException(429, "Too many codes requested. Please try again in an hour.")


def _store(db: Session, purpose: str, target: str) -> str:
    _rate_limit(db, purpose, target)
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    db.add(OtpCode(purpose=purpose, target=target, code_hash=_hash(code), expires_at=utcnow() + timedelta(minutes=CODE_TTL_MIN)))
    db.commit()
    return code


def _check_stored(db: Session, purpose: str, target: str, code: str) -> bool:
    row = db.scalar(
        select(OtpCode).where(OtpCode.purpose == purpose, OtpCode.target == target, OtpCode.used.is_(False))
        .order_by(OtpCode.id.desc())
    )
    if not row or row.expires_at < utcnow():
        raise HTTPException(400, "Code expired. Please request a new one.")
    if row.attempts >= MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong attempts. Please request a new code.")
    if row.code_hash != _hash(code.strip()):
        row.attempts += 1
        db.commit()
        return False
    row.used = True
    db.commit()
    return True


# ------------------------------------------------------------------ SMS
def _twilio(path: str, data: dict) -> dict:
    req = urllib.request.Request(
        f"https://verify.twilio.com/v2/Services/{config.TWILIO_VERIFY_SID}/{path}",
        data=urllib.parse.urlencode(data).encode(), method="POST",
    )
    auth = base64.b64encode(f"{config.TWILIO_ACCOUNT_SID}:{config.TWILIO_AUTH_TOKEN}".encode()).decode()
    req.add_header("Authorization", f"Basic {auth}")
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = json.loads(e.read() or b"{}").get("message", "SMS provider error")
        if path == "VerificationCheck" and e.code == 404:  # expired / already approved
            return {"status": "expired"}
        raise HTTPException(502, f"Could not send SMS: {detail}")
    except Exception:
        raise HTTPException(502, "Could not reach the SMS service. Try again.")


def send_sms_code(db: Session, phone: str) -> dict:
    if dev_mode_for("sms"):
        return {"channel": "sms", "demo": True, "dev_code": _store(db, "verify_phone", phone)}
    _rate_limit(db, "verify_phone", phone)
    try:
        _twilio("Verifications", {"To": phone, "Channel": "sms"})
    except HTTPException:
        # e.g. a Twilio trial can only text its verified numbers, or the free credit ran out.
        # Fall back to showing the code on screen so sign-up never gets stuck (unless OTP_DEV_MODE=false).
        if config.OTP_DEV_MODE == "false":
            raise
        return {"channel": "sms", "demo": True, "fallback": True, "dev_code": _store(db, "verify_phone", phone)}
    db.add(OtpCode(purpose="verify_phone", target=phone, code_hash="twilio", expires_at=utcnow() + timedelta(minutes=10)))
    db.commit()
    return {"channel": "sms", "demo": False}


def check_sms_code(db: Session, phone: str, code: str) -> bool:
    if dev_mode_for("sms"):
        return _check_stored(db, "verify_phone", phone, code)
    latest = db.scalar(select(OtpCode).where(OtpCode.purpose == "verify_phone", OtpCode.target == phone, OtpCode.used.is_(False))
                       .order_by(OtpCode.id.desc()))
    if latest is not None and latest.code_hash != "twilio":  # this code was a fallback shown on screen
        return _check_stored(db, "verify_phone", phone, code)
    res = _twilio("VerificationCheck", {"To": phone, "Code": code.strip()})
    if res.get("status") == "expired":
        raise HTTPException(400, "Code expired. Please request a new one.")
    return res.get("status") == "approved"


# ------------------------------------------------------------------ email
def _email_body(code: str, name: str) -> tuple[str, str]:
    text = (f"Hello {name},\n\nYour SmartRoute password reset code is {code}.\n"
            f"It is valid for {CODE_TTL_MIN} minutes. If you did not ask for this, ignore this email.\n\nSmartRoute Waste")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e2e7e4;border-radius:12px">
<div style="font-size:20px;font-weight:800;color:#1B7F5A">SmartRoute Waste</div>
<p>Hello {name},</p><p>Your password reset code is</p>
<div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#12201a;margin:12px 0">{code}</div>
<p style="color:#5f6b66">It is valid for {CODE_TTL_MIN} minutes. If you did not ask for this, you can ignore this email.</p></div>"""
    return text, html


def _send_email(to: str, name: str, subject: str, text: str, html: str) -> None:
    if config.BREVO_API_KEY:
        payload = {"sender": {"name": config.EMAIL_FROM_NAME, "email": config.EMAIL_FROM},
                   "to": [{"email": to, "name": name}], "subject": subject, "textContent": text, "htmlContent": html}
        req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(payload).encode(), method="POST",
                                     headers={"api-key": config.BREVO_API_KEY, "Content-Type": "application/json",
                                              "Accept": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=12).read()
        except Exception:
            raise HTTPException(502, "Could not send the email. Try again in a minute.")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"{config.EMAIL_FROM_NAME} <{config.EMAIL_FROM}>", to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=12) as s:
            s.starttls()
            if config.SMTP_USER:
                s.login(config.SMTP_USER, config.SMTP_PASSWORD)
            s.send_message(msg)
    except Exception:
        raise HTTPException(502, "Could not send the email. Try again in a minute.")


def send_reset_email(db: Session, email: str, name: str) -> dict:
    code = _store(db, "reset_password", email)
    if dev_mode_for("email"):
        return {"channel": "email", "demo": True, "dev_code": code}
    text, html = _email_body(code, name)
    _send_email(email, name, f"{code} is your SmartRoute reset code", text, html)
    return {"channel": "email", "demo": False}


def check_reset_code(db: Session, email: str, code: str) -> bool:
    return _check_stored(db, "reset_password", email, code)
