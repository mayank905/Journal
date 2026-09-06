from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert data.get("status") == "ok"
    assert "MindMirror" in data.get("app")
    print("PASS: /api/health passed")

def test_client_config_zero_secret_exposure():
    response = client.get("/api/config/client")
    assert response.status_code == 200
    data = response.json()
    assert "GEMINI_API_KEY" not in str(data)
    assert "GOOGLE_MAPS_API_KEY" not in str(data)
    assert "private_key" not in str(data)
    assert "firebase" in data
    print("PASS: /api/config/client verified: Zero server secrets exposed")

def test_auth_unauthorized():
    response = client.get("/api/auth/me")
    assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    print("PASS: /api/auth/me rejected unauthenticated request with 401")

def test_auth_dev_mock_token():
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer dev-mock-token-evaluator-99"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert data["authenticated"] is True
    assert data["user"]["uid"] == "evaluator-99"
    print("PASS: /api/auth/me verified token and returned user context")

def test_spa_serving():
    response = client.get("/")
    assert response.status_code == 200
    assert "MindMirror" in response.text
    print("PASS: SPA index.html served cleanly by FastAPI")

if __name__ == "__main__":
    test_health()
    test_client_config_zero_secret_exposure()
    test_auth_unauthorized()
    test_auth_dev_mock_token()
    test_spa_serving()
    print("\nALL AUTOMATED TESTS FOR TICKET 01 PASSED SUCCESSFULLY!")