// Semio : binaire unique PocketBase + front embarqué.
package main

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	"semio/internal/planning"
	"semio/internal/security"
	_ "semio/migrations"
	"semio/web"
)

func main() {
	app := pocketbase.New()

	// Automigrate (génération de migrations depuis l'admin) en dev seulement.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: osutils.IsProbablyGoRun(),
	})

	setup(app)
	bindExploitation(app) // lit l'environnement réel : hors de setup, que les tests partagent

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// setup branche tout ce qui est propre à Semio ; partagé avec les tests.
func setup(app core.App) {
	security.Bind(app)
	planning.Bind(app)

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Front embarqué avec repli SPA sur index.html (routes profondes).
		front := apis.Static(web.Dist(), true)
		e.Router.GET("/{path...}", func(re *core.RequestEvent) error {
			// Le repli ne vaut que pour le front : une route d'API inconnue reste un 404 JSON.
			if strings.HasPrefix(re.Request.URL.Path, "/api/") {
				return re.NotFoundError("", nil)
			}
			return front(re)
		})
		return e.Next()
	})
}
