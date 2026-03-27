import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models.user import User
from app.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    AccessTokenResponse, UserResponse, InitAdminRequest,
    ChangePasswordRequest
)
from app.middleware.auth_middleware import get_current_user, require_admin

router = APIRouter(tags=["Authentication"])

INIT_SECRET = os.getenv("INIT_SECRET", "")  # Optional one-time secret for admin init


# ─── Init Admin ────────────────────────────────────────────────────────────────
@router.post("/init", status_code=status.HTTP_201_CREATED)
def init_admin(payload: InitAdminRequest, db: Session = Depends(get_db)):
    """
    Create the first admin user. Only accessible when the users table is empty.
    Optionally protected by INIT_SECRET env var.
    """
    existing_count = db.query(User).count()
    if existing_count > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Init endpoint is disabled — users already exist."
        )

    if INIT_SECRET and payload.secret != INIT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid init secret."
        )

    admin = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": f"Admin user '{admin.username}' created successfully."}


# ─── Login ─────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with username + password, returns JWT access + refresh tokens."""
    user = db.query(User).filter(
        User.username == payload.username,
        User.is_active == True
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Update last login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token_data = {"sub": user.username, "admin": user.is_admin}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ─── Refresh ───────────────────────────────────────────────────────────────────
@router.post("/refresh", response_model=AccessTokenResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access token."""
    token_payload = decode_token(payload.refresh_token)

    if not token_payload or token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    username = token_payload.get("sub")
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"sub": user.username, "admin": user.is_admin}
    new_access_token = create_access_token(token_data)

    return AccessTokenResponse(
        access_token=new_access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ─── Current User ──────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at.isoformat(),
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change the password for the current user."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


# ─── Admin: List & Create Users ────────────────────────────────────────────────
@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """[Admin] List all registered users."""
    users = db.query(User).all()
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            is_active=u.is_active,
            is_admin=u.is_admin,
            created_at=u.created_at.isoformat(),
            last_login=u.last_login.isoformat() if u.last_login else None,
        )
        for u in users
    ]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: InitAdminRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """[Admin] Create a new user."""
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_admin=False,
    )
    db.add(new_user)
    db.commit()
    return {"message": f"User '{new_user.username}' created successfully."}
