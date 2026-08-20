package api

import "testing"

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"empty", "", true},
		{"too short", "short", true},
		{"just under min", "01234567890", true}, // 11 chars
		{"exactly min", "012345678901", false},  // 12 chars
		{"comfortable", "correcthorsebatterystaple", false},
		{"at bcrypt max", string(make([]byte, 72)), false},
		{"over bcrypt max", string(make([]byte, 73)), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validatePassword(%q) err = %v, wantErr = %v", tt.name, err, tt.wantErr)
			}
		})
	}
}
