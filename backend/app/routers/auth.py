"""Accounts: phone-verified sign-up, login with phone or email, password reset by email code."""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..geo import nearest_ward
from .. import notify
from ..database import get_db
from ..models import CreditTransaction, User
from ..schemas import (ChangePasswordIn, CodeSentOut, CreditTxOut, DriverLoginIn, ForgotIn, LoginIn, PhoneIn, ProfileUpdate,
                       RegisterIn, ResetIn, TokenOut, UserOut, VerifyPhoneIn)
from ..security import create_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def normalize_phone(raw: str) -> str:
    """Accepts 98765 43210, 09876543210, +91 98765-43210 ... -> +919876543210 (India default)."""
    digits = re.sub(r"\D", "", raw or "")
    if raw.strip().startswith("+"):
        phone = "+" + digits
    elif len(digits) == 10:
        phone = "+91" + digits
    elif len(digits) == 11 and digits.startswith("0"):
        phone = "+91" + digits[1:]
    elif len(digits) == 12 and digits.startswith("91"):
        phone = "+" + digits
    else:
        raise HTTPException(400, "Enter a valid 10-digit mobile number")
    if not 11 <= len(phone) <= 16:
        raise HTTPException(400, "Enter a valid mobile number")
    return phone


def mask(target: str) -> str:
    if "@" in target:
        name, dom = target.split("@", 1)
        return f"{name[:2]}{'•' * max(1, len(name) - 2)}@{dom}"
    return f"{target[:3]} •••••{target[-4:]}"


def _find_by_phone(db: Session, phone: str) -> User | None:
    return db.scalar(select(User).where(User.phone == phone))


def _token(user: User, db: Session) -> TokenOut:
    return TokenOut(token=create_token(user, db), user=UserOut.model_validate(user))


@router.post("/register", response_model=CodeSentOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Step 1 of sign-up: save the details and send a 6-digit code to the phone."""
    email = body.email.strip().lower()
    phone = normalize_phone(body.phone)
    by_email = db.scalar(select(User).where(func.lower(User.email) == email))
    by_phone = _find_by_phone(db, phone)
    # an unverified earlier attempt with the same phone/email may be overwritten
    for existing in {by_email, by_phone} - {None}:
        if existing.phone_verified is not False:
            what = "email" if existing is by_email else "mobile number"
            raise HTTPException(400, f"An account with this {what} already exists. Please log in.")
    user = by_phone or by_email or User(green_credits=0, reliability=1.0)
    user.name, user.email, user.phone = body.name.strip(), email, phone
    user.password_hash = hash_password(body.password)
    user.role = body.role
    user.account_type = body.account_type if body.role == "citizen" else None
    user.organization, user.address = body.organization, body.address
    user.ward = body.ward or nearest_ward(body.lat, body.lng)
    user.lat, user.lng, user.language = body.lat, body.lng, body.language
    user.phone_verified = False
    user.approved = body.role != "recycler"  # recyclers are approved by the admin
    user.is_active = True
    db.add(user)
    db.commit()
    sent = notify.send_sms_code(db, phone)
    return CodeSentOut(target=mask(phone), **sent)


@router.post("/resend-code", response_model=CodeSentOut)
def resend_code(body: PhoneIn, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    user = _find_by_phone(db, phone)
    if not user or user.phone_verified is not False:
        raise HTTPException(400, "Nothing to verify for this number")
    return CodeSentOut(target=mask(phone), **notify.send_sms_code(db, phone))


@router.post("/verify-phone", response_model=TokenOut)
def verify_phone(body: VerifyPhoneIn, db: Session = Depends(get_db)):
    """Step 2 of sign-up: check the SMS code; the account becomes active and the user is logged in."""
    phone = normalize_phone(body.phone)
    user = _find_by_phone(db, phone)
    if not user:
        raise HTTPException(404, "No sign-up found for this number")
    if not notify.check_sms_code(db, phone, body.code):
        raise HTTPException(400, "Wrong code. Please check the SMS and try again.")
    user.phone_verified = True
    db.commit()
    return _token(user, db)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    ident = body.email.strip()
    if "@" in ident:
        user = db.scalar(select(User).where(func.lower(User.email) == ident.lower()))
    else:
        try:
            user = _find_by_phone(db, normalize_phone(ident))
        except HTTPException:
            user = None
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong mobile number / email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled. Contact the municipality.")
    if user.phone_verified is False:
        notify_res = notify.send_sms_code(db, user.phone)
        raise HTTPException(409, {"code": "PHONE_NOT_VERIFIED", "phone": user.phone, "target": mask(user.phone),
                                  "message": "Please verify your mobile number first. We sent a new code.",
                                  "dev_code": notify_res.get("dev_code")})
    return _token(user, db)


_pin_fails: dict[str, list[float]] = {}  # employee ID -> times of recent wrong PINs


@router.post("/driver-login", response_model=TokenOut)
def driver_login(body: DriverLoginIn, db: Session = Depends(get_db)):
    """Drivers are registered by the municipality and log in with their employee ID only."""
    import time

    emp = body.employee_id.strip().upper().replace(" ", "")
    fails = _pin_fails.get(emp, [])
    fails = [t for t in fails if time.time() - t < 900]
    if len(fails) >= 5:
        raise HTTPException(429, "Too many wrong PINs. Try again in 15 minutes or ask the municipality office.")
    user = db.scalar(select(User).where(func.upper(User.employee_id) == emp, User.role == "collector"))
    if not user or not user.pin_hash or not verify_password(body.pin.strip(), user.pin_hash):
        _pin_fails[emp] = fails + [time.time()]
        raise HTTPException(401, "Wrong employee ID or PIN")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled. Contact the municipality.")
    _pin_fails.pop(emp, None)
    return _token(user, db)


@router.post("/forgot-password", response_model=CodeSentOut)
def forgot_password(body: ForgotIn, db: Session = Depends(get_db)):
    """Email a 6-digit reset code. Same answer whether or not the account exists (no account fishing)."""
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if not user or not user.is_active:
        return CodeSentOut(channel="email", target=mask(email), demo=notify.dev_mode_for("email"))
    return CodeSentOut(target=mask(email), **notify.send_reset_email(db, email, user.name))


@router.post("/reset-password", response_model=TokenOut)
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if not user or not notify.check_reset_code(db, email, body.code):
        raise HTTPException(400, "Wrong or expired code")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    return _token(user, db)


@router.post("/change-password", response_model=UserOut)
def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    patch = body.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(user, k, v)
    if ("lat" in patch or "lng" in patch) and "ward" not in patch:
        user.ward = nearest_ward(user.lat, user.lng) or user.ward
    db.commit()
    return user


@router.get("/me/credits", response_model=list[CreditTxOut])
def my_credits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(CreditTransaction).where(CreditTransaction.user_id == user.id).order_by(CreditTransaction.id.desc())
    ).all()


__all__ = ["router", "normalize_phone", "or_"]
