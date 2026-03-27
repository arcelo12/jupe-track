from pydantic import BaseModel, field_validator
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v



class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    is_admin: bool = False

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Username cannot be empty")
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_active: bool
    is_admin: bool
    created_at: str
    last_login: Optional[str]

    model_config = {"from_attributes": True}


class InitAdminRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    secret: Optional[str] = None  # Optional one-time init secret from env
