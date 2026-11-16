package main

import (
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"semio/web"
)

// api est une application Semio de test, sur base SQLite temporaire, appelée par vraies requêtes HTTP.
type api struct {
	t   *testing.T
	app *tests.TestApp
	mux http.Handler
}

func newAPI(t *testing.T) *api {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	setup(app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	var mux http.Handler
	serve := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serve, func(e *core.ServeEvent) error {
		mux, err = e.Router.BuildMux()
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return &api{t: t, app: app, mux: mux}
}

// do exécute une requête JSON et renvoie le statut et le corps.
func (a *api) do(method, url, token, body string) (int, string) {
	a.t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	a.mux.ServeHTTP(rec, req)
	out, _ := io.ReadAll(rec.Body)
	return rec.Code, string(out)
}

func TestHealthEtFallbackSPA(t *testing.T) {
	a := newAPI(t)
	if code, _ := a.do("GET", "/api/health", "", ""); code != 200 {
		t.Fatalf("/api/health = %d", code)
	}
	// Le repli SPA n'avale pas l'API.
	if code, out := a.do("GET", "/api/route-inexistante", "", ""); code != 404 || !strings.Contains(out, `"status":404`) {
		t.Errorf("route d'API inconnue = %d %s, attendu un 404 JSON", code, out)
	}
	// Une route front inconnue du serveur ne doit jamais répondre 404 quand le front est embarqué ;
	// sans build (dist vide) le repli n'a pas d'index.html, d'où le contrôle conditionnel.
	code, _ := a.do("GET", "/planning/2028/2", "", "")
	if _, err := fs.ReadFile(web.Dist(), "index.html"); err == nil && code != 200 {
		t.Fatalf("route profonde = %d avec un front embarqué", code)
	}
}
