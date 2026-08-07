package appwrite

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Config struct {
	Endpoint        string
	ProjectID       string
	APIKey          string
	DatabaseID      string
	CreatorsTableID string
	HTTPClient      *http.Client
}

type Client struct {
	endpoint        string
	projectID       string
	apiKey          string
	databaseID      string
	creatorsTableID string
	httpClient      *http.Client
}

// APIError is returned for non-2xx Appwrite responses.
type APIError struct {
	Status  int
	Message string
	Body    string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("appwrite: status=%d message=%s", e.Status, e.Message)
	}
	return fmt.Sprintf("appwrite: status=%d body=%s", e.Status, e.Body)
}

func (e *APIError) NotFound() bool {
	return e != nil && e.Status == http.StatusNotFound
}

func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return nil, errors.New("appwrite endpoint is required")
	}
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return nil, errors.New("appwrite project id is required")
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, errors.New("appwrite api key is required")
	}
	if strings.TrimSpace(cfg.DatabaseID) == "" {
		return nil, errors.New("appwrite database id is required")
	}
	if strings.TrimSpace(cfg.CreatorsTableID) == "" {
		return nil, errors.New("appwrite creators table id is required")
	}

	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}

	return &Client{
		endpoint:        strings.TrimRight(cfg.Endpoint, "/"),
		projectID:       cfg.ProjectID,
		apiKey:          cfg.APIKey,
		databaseID:      cfg.DatabaseID,
		creatorsTableID: cfg.CreatorsTableID,
		httpClient:      hc,
	}, nil
}

// RowsResult is the TablesDB list response.
type RowsResult struct {
	Total int              `json:"total"`
	Rows  []map[string]any `json:"rows"`
}

// ListRows GET /tablesdb/{db}/tables/{table}/rows
func (c *Client) ListRows(ctx context.Context, tableID string, queries []string) (RowsResult, error) {
	q := url.Values{}
	for _, query := range queries {
		q.Add("queries[]", query)
	}
	body, status, err := c.do(ctx, http.MethodGet, fmt.Sprintf("/tablesdb/%s/tables/%s/rows", c.databaseID, tableID), nil, q)
	if err != nil {
		return RowsResult{}, err
	}
	if status < 200 || status >= 300 {
		return RowsResult{}, parseAPIError(status, body)
	}
	var result RowsResult
	if err := json.Unmarshal(body, &result); err != nil {
		return RowsResult{}, fmt.Errorf("decode list rows: %w", err)
	}
	if result.Rows == nil {
		result.Rows = []map[string]any{}
	}
	return result, nil
}

// GetRow GET /tablesdb/{db}/tables/{table}/rows/{rowId}
func (c *Client) GetRow(ctx context.Context, tableID, rowID string) (map[string]any, error) {
	body, status, err := c.do(ctx, http.MethodGet, fmt.Sprintf("/tablesdb/%s/tables/%s/rows/%s", c.databaseID, tableID, url.PathEscape(rowID)), nil, nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return nil, &APIError{Status: status, Body: string(body)}
	}
	if status < 200 || status >= 300 {
		return nil, parseAPIError(status, body)
	}
	return decodeObject(body)
}

// CreateRow POST /tablesdb/{db}/tables/{table}/rows
func (c *Client) CreateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error) {
	payload := map[string]any{
		"rowId": rowID,
		"data":  data,
	}
	if len(permissions) > 0 {
		payload["permissions"] = permissions
	}
	body, status, err := c.do(ctx, http.MethodPost, fmt.Sprintf("/tablesdb/%s/tables/%s/rows", c.databaseID, tableID), payload, nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, parseAPIError(status, body)
	}
	return decodeObject(body)
}

// UpdateRow PATCH /tablesdb/{db}/tables/{table}/rows/{rowId}
func (c *Client) UpdateRow(ctx context.Context, tableID, rowID string, data map[string]any, permissions []string) (map[string]any, error) {
	payload := map[string]any{"data": data}
	if len(permissions) > 0 {
		payload["permissions"] = permissions
	}
	body, status, err := c.do(ctx, http.MethodPatch, fmt.Sprintf("/tablesdb/%s/tables/%s/rows/%s", c.databaseID, tableID, url.PathEscape(rowID)), payload, nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, parseAPIError(status, body)
	}
	return decodeObject(body)
}

// DeleteRow DELETE /tablesdb/{db}/tables/{table}/rows/{rowId}
func (c *Client) DeleteRow(ctx context.Context, tableID, rowID string) error {
	body, status, err := c.do(ctx, http.MethodDelete, fmt.Sprintf("/tablesdb/%s/tables/%s/rows/%s", c.databaseID, tableID, url.PathEscape(rowID)), nil, nil)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return parseAPIError(status, body)
	}
	return nil
}

// ErrInstagramAlreadyConnected is returned when ig_user_id (or username) is
// already owned by a different Appwrite auth user. One Instagram ↔ one Kaplun user.
type ErrInstagramAlreadyConnected struct {
	OwnerUserID string
	IGUserID    string
	Username    string
}

func (e *ErrInstagramAlreadyConnected) Error() string {
	name := e.Username
	if name == "" {
		name = e.IGUserID
	}
	return fmt.Sprintf("instagram @%s already connected to another account", name)
}

// StoreCreatorProfile upserts a creators row for this Appwrite auth user and
// returns its $id. Instagram identity is exclusive: if another user already
// owns the ig_user_id (or unique username), returns *ErrInstagramAlreadyConnected.
//
// Lookup:
//  1. ig_user_id — conflict unless owner == requester
//  2. username — same (skips stub placeholders where username == auth user id)
//  3. clerk_user_id stub for this user — update
//  4. else create
func (c *Client) StoreCreatorProfile(ctx context.Context, authUserID string, profile map[string]any) (string, bool, error) {
	if strings.TrimSpace(authUserID) == "" {
		return "", false, errors.New("auth user id is required")
	}
	if profile == nil {
		profile = map[string]any{}
	}
	profile["clerk_user_id"] = authUserID
	perms := UserPermissions(authUserID)

	igUserID, _ := profile["ig_user_id"].(string)
	igUserID = strings.TrimSpace(igUserID)
	username, _ := profile["username"].(string)
	username = strings.TrimSpace(username)

	if igUserID != "" {
		byIG, err := c.findCreatorRow(ctx, QueryEqual("ig_user_id", igUserID))
		if err != nil {
			return "", false, err
		}
		if byIG != nil {
			if conflict := foreignOwnerConflict(byIG, authUserID, igUserID, username); conflict != nil {
				return "", false, conflict
			}
			return c.updateCreatorRow(ctx, byIG, profile, perms)
		}
	}

	if username != "" && username != authUserID {
		byUsername, err := c.findCreatorRow(ctx, QueryEqual("username", username))
		if err != nil {
			return "", false, err
		}
		if byUsername != nil {
			if conflict := foreignOwnerConflict(byUsername, authUserID, igUserID, username); conflict != nil {
				return "", false, conflict
			}
			return c.updateCreatorRow(ctx, byUsername, profile, perms)
		}
	}

	byAuth, err := c.findCreatorRow(ctx, QueryEqual("clerk_user_id", authUserID))
	if err != nil {
		return "", false, err
	}
	if byAuth != nil {
		return c.updateCreatorRow(ctx, byAuth, profile, perms)
	}

	created, err := c.CreateRow(ctx, c.creatorsTableID, UniqueID, profile, perms)
	if err != nil {
		return "", false, err
	}
	docID, _ := created["$id"].(string)
	return docID, true, nil
}

func foreignOwnerConflict(row map[string]any, authUserID, igUserID, username string) *ErrInstagramAlreadyConnected {
	owner, _ := row["clerk_user_id"].(string)
	if owner == "" || owner == authUserID {
		return nil
	}
	if username == "" {
		username, _ = row["username"].(string)
	}
	if igUserID == "" {
		igUserID, _ = row["ig_user_id"].(string)
	}
	return &ErrInstagramAlreadyConnected{OwnerUserID: owner, IGUserID: igUserID, Username: username}
}

func (c *Client) updateCreatorRow(ctx context.Context, row map[string]any, profile map[string]any, perms []string) (string, bool, error) {
	docID, _ := row["$id"].(string)
	if docID == "" {
		return "", false, errors.New("creator row missing $id")
	}
	if _, err := c.UpdateRow(ctx, c.creatorsTableID, docID, profile, perms); err != nil {
		return "", false, err
	}
	return docID, true, nil
}

func (c *Client) findCreatorRow(ctx context.Context, equalQuery string) (map[string]any, error) {
	result, err := c.ListRows(ctx, c.creatorsTableID, []string{equalQuery, QueryLimit(1)})
	if err != nil {
		return nil, err
	}
	if len(result.Rows) == 0 {
		return nil, nil
	}
	return result.Rows[0], nil
}

// GetUserEmail returns the email for an Appwrite Auth user id, or "" if missing.
func (c *Client) GetUserEmail(ctx context.Context, userID string) (string, error) {
	if strings.TrimSpace(userID) == "" {
		return "", errors.New("user id is required")
	}
	body, status, err := c.do(ctx, http.MethodGet, fmt.Sprintf("/users/%s", url.PathEscape(userID)), nil, nil)
	if err != nil {
		return "", err
	}
	if status == http.StatusNotFound {
		return "", &APIError{Status: status, Body: string(body)}
	}
	if status < 200 || status >= 300 {
		return "", parseAPIError(status, body)
	}
	obj, err := decodeObject(body)
	if err != nil {
		return "", err
	}
	email, _ := obj["email"].(string)
	return email, nil
}

// EnsureCreatorProfile creates a minimal creators row when one does not exist.
func (c *Client) EnsureCreatorProfile(ctx context.Context, clerkUserID string) error {
	if strings.TrimSpace(clerkUserID) == "" {
		return errors.New("clerk user id is required")
	}

	result, err := c.ListRows(ctx, c.creatorsTableID, []string{
		QueryEqual("clerk_user_id", clerkUserID),
		QueryLimit(1),
	})
	if err != nil {
		return err
	}
	if result.Total > 0 || len(result.Rows) > 0 {
		return nil
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = c.CreateRow(ctx, c.creatorsTableID, UniqueID, map[string]any{
		"clerk_user_id":   clerkUserID,
		"username":        clerkUserID,
		"full_name":       "",
		"bio":             "",
		"profile_pic_url": "",
		"follower_count":  0,
		"following_count": 0,
		"post_count":      0,
		"engagement_rate": 0.0,
		"is_onboarded":    false,
		"is_active":       true,
		"created_at":      now,
		"updated_at":      now,
	}, UserPermissions(clerkUserID))
	return err
}

func (c *Client) listUsers(ctx context.Context, queries []string) ([]map[string]any, error) {
	q := url.Values{}
	for _, query := range queries {
		q.Add("queries[]", query)
	}
	body, status, err := c.do(ctx, http.MethodGet, "/users", nil, q)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, parseAPIError(status, body)
	}
	var parsed struct {
		Users []map[string]any `json:"users"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode users: %w", err)
	}
	return parsed.Users, nil
}

func (c *Client) createUser(ctx context.Context, userID, name string) (string, error) {
	payload := map[string]any{
		"userId": userID,
		"name":   name,
	}
	body, status, err := c.do(ctx, http.MethodPost, "/users", payload, nil)
	if err != nil {
		return "", err
	}
	if status < 200 || status >= 300 {
		return "", parseAPIError(status, body)
	}
	obj, err := decodeObject(body)
	if err != nil {
		return "", err
	}
	id, _ := obj["$id"].(string)
	if id == "" {
		return userID, nil
	}
	return id, nil
}

func (c *Client) createUserToken(ctx context.Context, userID string) (string, error) {
	body, status, err := c.do(ctx, http.MethodPost, fmt.Sprintf("/users/%s/tokens", url.PathEscape(userID)), map[string]any{}, nil)
	if err != nil {
		return "", err
	}
	if status < 200 || status >= 300 {
		return "", parseAPIError(status, body)
	}
	obj, err := decodeObject(body)
	if err != nil {
		return "", err
	}
	secret, _ := obj["secret"].(string)
	if secret == "" {
		return "", errors.New("appwrite token response missing secret")
	}
	return secret, nil
}

// do performs an authenticated Appwrite REST request.
func (c *Client) do(ctx context.Context, method, path string, payload any, query url.Values) ([]byte, int, error) {
	u := c.endpoint + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reader io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal payload: %w", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Appwrite-Project", c.projectID)
	req.Header.Set("X-Appwrite-Key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

func decodeObject(body []byte) (map[string]any, error) {
	var obj map[string]any
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, fmt.Errorf("decode object: %w", err)
	}
	return obj, nil
}

func parseAPIError(status int, body []byte) error {
	var parsed struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(body, &parsed)
	return &APIError{Status: status, Message: parsed.Message, Body: string(body)}
}
