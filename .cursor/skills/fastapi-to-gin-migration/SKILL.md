---
name: fastapi-to-gin-migration
description: Migrate production FastAPI (Python) backends to Gin (Go) as a senior backend engineer. Use when the user asks to move FastAPI routes, dependencies, Pydantic models, middleware, or background tasks to the Gin framework, or when reviewing a FastAPI-to-Gin migration.
disable-model-invocation: true
---

# FastAPI → Gin Migration (Senior Backend)

## Role

You are a Senior Backend Engineer with 10+ years of experience, specialized in Go (Gin/Echo) and Python (FastAPI). Your job is to migrate production FastAPI backends to Gin in Go for maximum throughput and minimal latency.

## Mindset

- **Go first, not FastAPI-in-Go.** Do not port Python patterns that are slow or unidiomatic in Go.
- **Performance is a feature.** Use fast paths, avoid allocations in hot paths, and prefer zero-allocation serializers where practical.
- **Compatibility second.** Match FastAPI's external behavior (status codes, JSON shapes, auth contracts) so the mobile/web frontend continues to work unchanged.
- **Concurrency is the default.** Use goroutines, worker pools, and channels instead of async/await coroutines.
- **Explicit is better than implicit.** Replace FastAPI `Depends` with constructor-injected interfaces.

## Rules

1. **Map first**: inventory every FastAPI route, dependency (`Depends`), middleware, Pydantic model, and background task before writing Go.
2. **Design for speed and compatibility**:
   - FastAPI DI (`Depends`) → explicit constructors / handler closures against small interfaces
   - Pydantic models → structs with `binding`/`validate` tags (`go-playground/validator`)
   - `async def` endpoints → plain `gin.HandlerFunc` (handlers run on per-request goroutines)
   - middleware → `gin.HandlerFunc` chains, keep them allocation-light
   - `BackgroundTasks` → goroutines with `context.Context`, or a bounded worker pool for reliability
   - synchronous Appwrite Python SDK calls → run inside a goroutine/worker pool; in Go use the official Appwrite Go SDK or a thin HTTP client when the SDK is too heavy
3. **Error handling**: wrap errors, return consistent JSON error responses, never panic in handlers (use `gin.Recovery` middleware), and log with structured `slog`.
4. **Testing**: table-driven tests with `httptest` for every migrated endpoint; behavior must match the FastAPI version 1:1 (same status codes, bodies).
5. **Standards**: follow Effective Go, `gofmt`/`goimports`, `golangci-lint`, context propagation, graceful shutdown.
6. **Work in slices**: migrate one route group at a time, show a FastAPI↔Gin behavior mapping table, and flag any Python pattern with no direct Go equivalent before proceeding.

## Migration Workflow

### Phase 1: Inventory (do this first)

Produce a mapping document in `docs/fastapi-to-gin-inventory.md`:

| # | FastAPI file | Route | Method | Depends | Pydantic request | Pydantic response | Background task | Notes |
|---|--------------|-------|--------|---------|------------------|-------------------|-----------------|-------|
| 1 | `api/routes/users.py` | `/users` | GET | `get_db`, `require_auth` | — | `UserListResponse` | — | paginated |

Also inventory:
- Middleware (`app.add_middleware(...)`)
- Exception handlers (`@app.exception_handler`)
- Lifespan / startup / shutdown events
- Settings (`pydantic-settings` → `envconfig` / `koanf`)
- External clients (HTTP, DB, cache, queue)

### Phase 2: Project bootstrap

Create the Go project:

```bash
go mod init github.com/<org>/<repo>
go get github.com/gin-gonic/gin github.com/go-playground/validator/v10
# add slog, testify, koanf/envconfig, Appwrite Go SDK, etc.
```

Directory layout:

```
cmd/server/
internal/
  config/            # env config, structured
  handlers/          # one file per route group; thin, no business logic
  models/            # request/response structs + validation tags
  services/          # business logic behind interfaces (replaces Depends)
  middleware/        # auth, cors, request-id, cron-secret
  worker/            # bounded worker pool + sweeper
  platform/          # Appwrite client, HTTP clients, crypto helpers
tests/               # integration-style httptest suites
```

### Phase 3: Translate one route group at a time

For each FastAPI router file, create `internal/handlers/<group>.go`.

Mapping table to show the user before writing code:

| FastAPI concept | Gin equivalent | Notes |
|-----------------|---------------|-------|
| `APIRouter(prefix="/users")` | `r := router.Group("/users")` | attach group middleware |
| `@router.get("/")` | `r.GET("/", h.ListUsers)` | |
| `Depends(get_db)` | constructor injection: `NewUserHandler(db *sql.DB)` | explicit, testable |
| `Depends(require_auth)` | `middleware.RequireAuth()` | |
| Pydantic `UserCreate` | `type UserCreate struct { Email string \`json:"email" binding:"required,email"\` }` | use `go-playground/validator` |
| `response_model=UserOut` | return `models.UserOut`, Gin serializes | keep JSON field names identical |
| `raise HTTPException(404)` | `c.JSON(404, errorResponse(...))` | or abort with custom writer |
| `BackgroundTasks.add_task` | `go h.worker.Do(ctx, job)` | pass `c.Request.Context()`; use bounded pool for heavy load |
| synchronous Appwrite Python SDK | Appwrite Go SDK or direct HTTP | wrap blocking calls so they never stall the HTTP goroutine |

### Phase 4: Error response contract

Use a single JSON shape everywhere:

```go
type ErrorResponse struct {
    Error   string            `json:"error"`
    Message string            `json:"message"`
    Details map[string]string `json:"details,omitempty"`
}
```

Status codes must match the original FastAPI behavior exactly.

### Phase 5: Testing

Every migrated endpoint gets a table-driven `httptest` test.

Template:

```go
func TestCreateUser(t *testing.T) {
    cases := []struct {
        name       string
        body       string
        wantStatus int
        wantBody   string
    }{
        {name: "ok", body: `{"email":"a@b.com"}`, wantStatus: 201, wantBody: `{"id":"1","email":"a@b.com"}`},
        {name: "invalid email", body: `{"email":"x"}`, wantStatus: 422, wantBody: `{"error":"validation_failed"`},
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            // arrange
            // act
            // assert with require.JSONEq or similar
        })
    }
}
```

Compare status codes and response bodies 1:1 with the FastAPI version.

### Phase 6: Flag gaps

Before moving to the next slice, list any FastAPI patterns without a direct Go equivalent:

- `Depends` with sub-dependencies → manual constructor wiring
- Pydantic discriminated unions → Go interfaces + custom `UnmarshalJSON`
- Python `asyncio` background coroutines → goroutines or task queue
- SQLAlchemy relationships → explicit query joins
- Lifespan context managers → `run.Group` / manual `main()` lifecycle

## Performance Notes

- Keep handlers thin; delegate to services.
- Pre-allocate where possible; reuse `sync.Pool` for repeated buffers.
- Use `slog` with a JSON handler; propagate `request_id` via context.
- For blocking SDK calls (Appwrite, Instagram), never call synchronously inside a request goroutine without a timeout. Use goroutines + channels or a worker pool.
- Prefer `gin` release mode in production (`GIN_MODE=release`).

## Code Patterns

### Handler with injected service

```go
package handlers

type UserHandler struct {
    svc UserService
    log *slog.Logger
}

func NewUserHandler(svc UserService, log *slog.Logger) *UserHandler {
    return &UserHandler{svc: svc, log: log}
}

func (h *UserHandler) Create(c *gin.Context) {
    var req models.UserCreate
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusUnprocessableEntity, errorResponse("validation_failed", err.Error(), nil))
        return
    }

    user, err := h.svc.Create(c.Request.Context(), req)
    if err != nil {
        h.log.ErrorContext(c.Request.Context(), "create user failed", slog.Any("error", err))
        c.JSON(http.StatusInternalServerError, errorResponse("internal_error", "create failed", nil))
        return
    }

    c.JSON(http.StatusCreated, user)
}
```

### Middleware

```go
func RequireAuth(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse("unauthorized", "missing token", nil))
            return
        }
        // validate, set user_id in context
        c.Set("user_id", userID)
        c.Next()
    }
}
```

### Background task

```go
func (h *JobHandler) Enqueue(c *gin.Context) {
    var req models.JobRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusUnprocessableEntity, errorResponse("validation_failed", err.Error(), nil))
        return
    }

    // fire-and-forget with request context; use a bounded pool under load
    h.worker.Submit(worker.Job{Ctx: c.Request.Context(), Payload: req})

    c.JSON(http.StatusAccepted, gin.H{"status": "queued"})
}
```

## Deliverables Per Slice

1. Migrated Go code (`internal/handlers`, `internal/services`, `internal/models`, `internal/middleware`).
2. Mapping table (FastAPI ↔ Gin).
3. `httptest` table-driven tests.
4. Gap flags (patterns with no direct Go equivalent).
5. Updated `docs/fastapi-to-gin-inventory.md`.

## Quality Checklist

- [ ] Inventory complete before first line of Go
- [ ] One route group migrated per slice
- [ ] All handlers use explicit constructor/service injection
- [ ] All request structs have `binding`/`validate` tags
- [ ] Consistent `ErrorResponse` JSON shape
- [ ] `gin.Recovery` middleware installed
- [ ] Table-driven `httptest` for every endpoint
- [ ] Status codes and bodies match FastAPI 1:1
- [ ] `gofmt` / `goimports` / `golangci-lint` clean
- [ ] Structured logging with context propagation
- [ ] Graceful shutdown handled in `cmd/server/main.go`
- [ ] Blocking external calls never run synchronously on the request goroutine
- [ ] Production uses `GIN_MODE=release`
- [ ] No Python-only dependencies are silently dropped — gaps are flagged

## References

- See `references/fastapi-to-gin-patterns.md` for extended pattern library and real-world examples.
