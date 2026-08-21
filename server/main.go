package main

import (
	"log"
	"net/http"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/collections"
	"github.com/spec-kitty/pack-composer/server/handlers"
	"github.com/spec-kitty/pack-composer/server/pack/builtin"
)

// Angular local origins for the PocketBase JS SDK (analysis U1).
var angularLocalOrigins = []string{
	"http://localhost:4200",
	"http://127.0.0.1:4200",
}

func main() {
	app := pocketbase.New()

	// Bootstrap pack collections after the app DB is ready.
	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if err := collections.Bootstrap(e.App); err != nil {
			return err
		}
		// Built-in pack bootstrap must never crash server startup (R6):
		// log and degrade to an empty/partial built-in pack instead.
		if err := builtin.Bootstrap(e.App); err != nil {
			log.Printf("builtin pack bootstrap failed (non-fatal): %v", err)
		}
		return nil
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Replace default CORS with Angular localhost origins (analysis U1).
		// Same middleware id (pbCors) replaces the Serve() default binding.
		e.Router.Bind(apis.CORS(apis.CORSConfig{
			AllowOrigins: angularLocalOrigins,
			AllowMethods: []string{
				http.MethodGet,
				http.MethodHead,
				http.MethodPut,
				http.MethodPatch,
				http.MethodPost,
				http.MethodDelete,
			},
		}))

		// WP03 attaches custom /api/packs/* routes here.
		handlers.Register(e)

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
