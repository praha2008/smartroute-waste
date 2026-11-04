from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CreditTransaction, User
from ..schemas import CreditTxOut, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import create_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(400, "An account with this email already exists")
    user = User(
        name=body.name.strip(),
        email=email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=body.role,
        account_type=body.account_type if body.role == "citizen" else None,
        organization=body.organization,
        address=body.address,
        ward=body.ward,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(user)
    db.commit()
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if not user.is_active:
        raise HTTPException(403, "Account disabled")
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.merge(user)
    db.commit()
    return user


@router.get("/me/credits", response_model=list[CreditTxOut])
def my_credits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(CreditTransaction).where(CreditTransaction.user_id == user.id).order_by(CreditTransaction.id.desc())
    ).all()
