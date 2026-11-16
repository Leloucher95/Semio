// Package web embarque le build Vite (copié dans dist/ par `npm run build`).
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist est la racine du front compilé.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // impossible : "dist" est embarqué à la compilation
	}
	return sub
}
