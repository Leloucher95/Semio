// Semio : binaire unique PocketBase + front embarqué.
package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

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

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// setup branche tout ce qui est propre à Semio ; partagé avec les tests.
func setup(app core.App) {
	security.Bind(app)

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Front embarqué avec repli SPA sur index.html (routes profondes).
		e.Router.GET("/{path...}", apis.Static(web.Dist(), true))
		return e.Next()
	})
}
