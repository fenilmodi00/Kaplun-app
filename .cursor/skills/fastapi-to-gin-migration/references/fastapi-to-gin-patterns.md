# FastAPI → Gin Pattern Library

Extended reference for the `fastapi-to-gin-migration` skill.

## 1. Dependency Injection Mapping

### FastAPI

```python
async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session

async def require_auth(
    token: str = Header(),
    db: AsyncSession = Depends(get_db)
) -> User:
    ...

@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(require_auth)):
    return user
```

### Gin

```go
// internal/services/auth.go
type AuthService interface {
    Authenticate(ctx context.Context, token string) (models.User, error)
}

// internal/handlers/user.go
type UserHandler struct {
    auth AuthService
}

func NewUserHandler(auth AuthService) *UserHandler {
    return &UserHandler{auth: auth}
}

// internal/middleware/auth.go
func AuthMiddleware(auth AuthService) gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        user, err := auth.Authenticate(c.Request.Context(), token)
        if err != nil {
            c.AbortWithStatusJSON(401, errorResponse("unauthorized", err.Error(), nil))
            return
        }
        c.Set("user", user)
        c.Next()
    }
}

// wire in main
authMiddleware := middleware.AuthMiddleware(authSvc)
r.GET("/me", authMiddleware, userHandler.Me)
```

## 2. Validation Mapping

### FastAPI

```python
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    age: int = Field(ge=0, le=120)
```

### Gin

```go
package models

type UserCreate struct {
    Email string `json:"email" binding:"required,email"`
    Age   int    `json:"age" binding:"required,gte=0,lte=120"`
}
```

Register custom validators once at startup:

```go
if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
    v.RegisterValidation("custom", customValidator)
}
```

## 3. Exception Handling

### FastAPI

```python
@app.exception_handler(NotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"error": "not_found", "message": str(exc)})
```

### Gin

```go
func ErrorMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Next()
        if len(c.Errors) > 0 {
            err := c.Errors.Last().Err
            switch e := err.(type) {
            case *NotFoundError:
                c.JSON(404, errorResponse("not_found", e.Error(), nil))
            default:
                c.JSON(500, errorResponse("internal_error", "internal server error", nil))
            }
        }
    }
}
```

Use `c.Error(err)` inside handlers to delegate to the middleware.

## 4. Background Tasks

### FastAPI

```python
@router.post("/report")
async def report(tasks: BackgroundTasks):
    tasks.add_task(generate_report)
    return {"status": "queued"}
```

### Gin — goroutine with context

```go
func (h *ReportHandler) Create(c *gin.Context) {
    go h.svc.Generate(c.Request.Context())
    c.JSON(http.StatusAccepted, gin.H{"status": "queued"})
}
```

### Gin — persistent job queue (preferred for production)

Use `github.com/hibiken/asynq` or similar. Store Redis-backed tasks and process them in separate workers.

## 5. Settings

### FastAPI

```python
class Settings(BaseSettings):
    database_url: str
    secret_key: str
```

### Gin

Use `github.com/kelseyhightower/envconfig` or `github.com/knadh/koanf`:

```go
type Config struct {
    DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
    SecretKey   string `envconfig:"SECRET_KEY"   required:"true"`
}
```

## 6. Database Access

### FastAPI + SQLAlchemy

```python
async with get_db() as db:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
```

### Gin + sqlc (recommended)

Generate typed queries from SQL with `sqlc`. Handlers receive a `*sqlc.Queries` (or interface) via constructor.

```go
queries := db.New(pool)
userHandler := handlers.NewUserHandler(queries)
```

## 7. Testing Equivalence

Always verify:

- Same HTTP method and path
- Same accepted content types
- Same request validation failures (422 in FastAPI → 422 in Gin)
- Same success status and body
- Same auth rejection status (401 vs 403)
- Same error JSON shape

## 8. Common Gap Flags

| Python / FastAPI | Go / Gin gap | Recommendation |
|------------------|--------------|----------------|
| `async` generators | no native equivalent | use channels or iterators |
| Pydantic `Union` | Go lacks sum types | use interface + custom unmarshaler |
| SQLAlchemy lazy loads | no lazy loading | explicit query joins |
| `@lru_cache` | `sync.Map` or `golang.org/x/sync/singleflight` | choose TTL cache if needed |
| `pytest` fixtures | `testify/suite` or plain setup funcs | keep table-driven |
