"""Password hashing (PBKDF2, stdlib only), JWT tokens and role guards."""
import base64
import hashlib
import hmac
import os
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import SECRET_KEY, TOKEN_EXPIRE_HOURS
from .database import get_db
from .models import AppMeta, User, utcnow

_ITERATIONS = 200_000
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iterations))
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except ValueError:
        return False


def data_epoch(db: Session) -> str:
    meta = db.get(AppMeta, "data_epoch")
    return meta.value if meta else ""


def create_token(user: User, db: Session) -> str:
    payload = {"sub": str(user.id), "role": user.role, "ep": data_epoch(db),
               "exp": utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again")
    # after a demo-data reset, old tokens may point at a different user id -> force re-login
    if payload.get("ep", "") != data_epoch(db):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Data was reset, please log in again")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    return user


def require_role(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This action needs role: {', '.join(roles)}")
        return user

    return checker
