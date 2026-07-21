// CLI tool untuk mengelola API key langsung dari database,
// tanpa perlu login JWT admin. Dijalankan di host/container yang
// punya akses ke file SQLite (env DB_PATH, default sama dengan server).
//
// Contoh:
//
//	docker exec jupetrack_go /app/apikey create --name grafana --scopes read:metrics,read:device
//	docker exec jupetrack_go /app/apikey list
//	docker exec jupetrack_go /app/apikey revoke --id 3
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/api"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
)

func usage() {
	fmt.Fprintf(os.Stderr, `Pengelolaan API key JupeTrack (akses DB langsung, tanpa JWT).

Usage:
  apikey create --name <nama> [--scopes s1,s2] [--expires-in-days N]
  apikey list
  apikey revoke --id <id>

Perintah:
  create   Buat API key baru. Key plaintext (jpt_...) dicetak SEKALI.
  list     Tampilkan semua key (tanpa secret).
  revoke   Nonaktifkan key berdasarkan ID.

Scope valid: %s
`, strings.Join(api.ValidScopes(), ", "))
	os.Exit(2)
}

func main() {
	log.SetFlags(0)

	if len(os.Args) < 2 {
		usage()
	}

	switch os.Args[1] {
	case "create":
		cmdCreate(os.Args[2:])
	case "list":
		cmdList()
	case "revoke":
		cmdRevoke(os.Args[2:])
	default:
		usage()
	}
}

func cmdCreate(args []string) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	name := fs.String("name", "", "nama key (wajib)")
	scopesFlag := fs.String("scopes", "", "daftar scope dipisah koma (kosong = tanpa scope)")
	expiresInDays := fs.Int("expires-in-days", 0, "masa berlaku dalam hari (0 = tidak pernah kedaluwarsa)")
	fs.Parse(args)

	*name = strings.TrimSpace(*name)
	if *name == "" || len(*name) > 128 {
		log.Fatal("error: --name wajib diisi (maks 128 karakter)")
	}

	var scopes []string
	if *scopesFlag != "" {
		for _, s := range strings.Split(*scopesFlag, ",") {
			s = strings.TrimSpace(s)
			valid := false
			for _, v := range api.ValidScopes() {
				if s == v {
					valid = true
					break
				}
			}
			if !valid {
				log.Fatalf("error: scope tidak valid: %q (valid: %s)", s, strings.Join(api.ValidScopes(), ", "))
			}
			scopes = append(scopes, s)
		}
	}

	database.Connect()

	plain, prefix, hash, err := api.GenerateAPIKey()
	if err != nil {
		log.Fatalf("error: gagal generate key: %v", err)
	}

	var expiresAt *time.Time
	if *expiresInDays > 0 {
		t := time.Now().Add(time.Duration(*expiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	key := models.APIKey{
		Name:      *name,
		Prefix:    prefix,
		KeyHash:   hash,
		Scopes:    strings.Join(scopes, ","),
		IsActive:  true,
		ExpiresAt: expiresAt,
		CreatedBy: "cli",
	}
	if err := database.DB.Create(&key).Error; err != nil {
		log.Fatalf("error: gagal menyimpan key: %v", err)
	}

	fmt.Println("================================================================")
	fmt.Println("API KEY DIBUAT — simpan key berikut, TIDAK akan ditampilkan lagi:")
	fmt.Printf("  %s\n", plain)
	fmt.Println("================================================================")
	fmt.Printf("ID: %d | Nama: %s | Scopes: [%s]", key.ID, key.Name, strings.Join(scopes, ", "))
	if expiresAt != nil {
		fmt.Printf(" | Kedaluwarsa: %s", expiresAt.Format("2006-01-02"))
	}
	fmt.Println()
}

func cmdList() {
	database.Connect()

	var keys []models.APIKey
	if err := database.DB.Find(&keys).Error; err != nil {
		log.Fatalf("error: gagal membaca keys: %v", err)
	}
	if len(keys) == 0 {
		fmt.Println("Belum ada API key.")
		return
	}

	fmt.Printf("%-4s %-20s %-14s %-30s %-8s %-12s %s\n", "ID", "NAMA", "PREFIX", "SCOPES", "AKTIF", "KEDALUWARSA", "TERAKHIR DIPAKAI")
	for _, k := range keys {
		exp := "-"
		if k.ExpiresAt != nil {
			exp = k.ExpiresAt.Format("2006-01-02")
		}
		used := "-"
		if k.LastUsedAt != nil {
			used = k.LastUsedAt.Format("2006-01-02 15:04")
		}
		fmt.Printf("%-4d %-20s %-14s %-30s %-8t %-12s %s\n",
			k.ID, k.Name, k.Prefix, k.Scopes, k.IsActive, exp, used)
	}
}

func cmdRevoke(args []string) {
	fs := flag.NewFlagSet("revoke", flag.ExitOnError)
	id := fs.String("id", "", "ID key yang dinonaktifkan (wajib)")
	fs.Parse(args)

	n, err := strconv.ParseUint(*id, 10, 64)
	if *id == "" || err != nil {
		log.Fatal("error: --id wajib berupa angka (lihat: apikey list)")
	}

	database.Connect()

	result := database.DB.Model(&models.APIKey{}).Where("id = ?", n).Update("is_active", false)
	if result.Error != nil {
		log.Fatalf("error: gagal revoke: %v", result.Error)
	}
	if result.RowsAffected == 0 {
		log.Fatalf("error: key dengan ID %d tidak ditemukan", n)
	}
	fmt.Printf("Key ID %d dinonaktifkan.\n", n)
}
