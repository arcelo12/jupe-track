package models_test

import (
	"testing"

	"github.com/arcelo12/jupe-track/backend-go/internal/models"
)

func TestThemePresetConstantsAndValidation(t *testing.T) {
	presets := []string{
		models.ThemePresetGraphiteMono,
		models.ThemePresetSignalBlue,
		models.ThemePresetNetworkTeal,
		models.ThemePresetMidnightIndigo,
	}

	expected := []string{"graphite-mono", "signal-blue", "network-teal", "midnight-indigo"}
	for i, p := range presets {
		if p != expected[i] {
			t.Fatalf("preset[%d] = %q, want %q", i, p, expected[i])
		}
		if !models.IsValidThemePreset(p) {
			t.Fatalf("IsValidThemePreset(%q) = false, want true", p)
		}
		if err := models.ValidateThemePreset(p); err != nil {
			t.Fatalf("ValidateThemePreset(%q) error = %v, want nil", p, err)
		}
	}

	if models.DefaultThemePreset != models.ThemePresetGraphiteMono {
		t.Fatalf("DefaultThemePreset = %q, want %q", models.DefaultThemePreset, models.ThemePresetGraphiteMono)
	}

	invalidPresets := []string{"", "neon-green", "custom", "DARK"}
	for _, p := range invalidPresets {
		if models.IsValidThemePreset(p) {
			t.Fatalf("IsValidThemePreset(%q) = true, want false", p)
		}
		if err := models.ValidateThemePreset(p); err == nil {
			t.Fatalf("ValidateThemePreset(%q) expected error, got nil", p)
		}
		if got := models.NormalizeThemePreset(p); got != models.DefaultThemePreset {
			t.Fatalf("NormalizeThemePreset(%q) = %q, want %q", p, got, models.DefaultThemePreset)
		}
	}
}

func TestColorModeConstantsAndValidation(t *testing.T) {
	modes := []string{
		models.ColorModeDark,
		models.ColorModeLight,
	}

	expected := []string{"dark", "light"}
	for i, m := range modes {
		if m != expected[i] {
			t.Fatalf("mode[%d] = %q, want %q", i, m, expected[i])
		}
		if !models.IsValidColorMode(m) {
			t.Fatalf("IsValidColorMode(%q) = false, want true", m)
		}
		if err := models.ValidateColorMode(m); err != nil {
			t.Fatalf("ValidateColorMode(%q) error = %v, want nil", m, err)
		}
	}

	if models.DefaultColorMode != models.ColorModeDark {
		t.Fatalf("DefaultColorMode = %q, want %q", models.DefaultColorMode, models.ColorModeDark)
	}

	invalidModes := []string{"", "auto", "dim", "DARK"}
	for _, m := range invalidModes {
		if models.IsValidColorMode(m) {
			t.Fatalf("IsValidColorMode(%q) = true, want false", m)
		}
		if err := models.ValidateColorMode(m); err == nil {
			t.Fatalf("ValidateColorMode(%q) expected error, got nil", m)
		}
		if got := models.NormalizeColorMode(m); got != models.DefaultColorMode {
			t.Fatalf("NormalizeColorMode(%q) = %q, want %q", m, got, models.DefaultColorMode)
		}
	}
}
