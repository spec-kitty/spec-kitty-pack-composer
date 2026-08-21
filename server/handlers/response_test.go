package handlers

import (
	"encoding/json"
	"testing"
)

func TestErrorBodySerializesRecoverableCode(t *testing.T) {
	t.Parallel()

	body := ErrorBody{
		Message: "no recognizable artifacts found at source_path",
		Code:    "no_artifacts",
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	code, ok := decoded["code"].(string)
	if !ok || code != "no_artifacts" {
		t.Fatalf("code not recoverable as string: %#v (raw=%s)", decoded["code"], raw)
	}
	if decoded["message"] != body.Message {
		t.Fatalf("message=%v", decoded["message"])
	}

	// Regression: PocketBase ApiError safeErrorsData would nest this into
	// data.code = {code: validation_invalid_value, message: Invalid value.}.
	if _, nested := decoded["code"].(map[string]any); nested {
		t.Fatal("code must remain a plain string, not a nested SafeErrorItem object")
	}
}
