from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency to verify Bearer JWT and return the authenticated User.
    Raises 401 if the token is missing, invalid, or expired.
    """
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise exc

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise exc

    username: str = payload.get("sub")
    if not username:
        raise exc

    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise exc

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that additionally requires the user to be an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user
